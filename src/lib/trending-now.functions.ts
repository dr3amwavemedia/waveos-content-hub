import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {normalizeTrendResults,videoTrendResults,trendVideoSource,type Trend} from "./trending-now";

export const discoverTrends=createServerFn({method:"POST"}).middleware([requireSupabaseAuth])
 .inputValidator(input=>z.object({workspaceId:z.string().uuid(),type:z.enum(["audio","format","hook","topic"]).default("topic"),query:z.string().max(600).default(""),filters:z.object({platform:z.enum(['All videos','TikTok','Instagram','YouTube','Facebook']),style:z.string().max(80),language:z.string().max(80),market:z.string().max(120),niche:z.string().max(120),businessType:z.string().max(120),audience:z.string().max(120),days:z.union([z.literal(3),z.literal(7),z.literal(30)]),kind:z.string().max(80)}).optional()}).parse(input))
 .handler(async({data,context})=>{
  const {requireWorkspaceFeatureAccess}=await import("./zernio.server");
  await requireWorkspaceFeatureAccess(context.supabase,context.userId,data.workspaceId,"can_use_competitive_intelligence");
  const key=process.env.PARALLEL_API_KEY,appKey=process.env.LOVABLE_API_KEY;
  if(!key||!appKey)return {trends:[],message:"Trend research connection is unavailable.",observedAt:new Date().toISOString()};
  const connectionKey:string=key;
  const {data:brand,error}=await context.supabase.from("brand_profiles").select("business_name,industry,primary_services,service_area,target_audience").eq("workspace_id",data.workspaceId).maybeSingle();
  if(error)throw new Error("Workspace brand context could not be read.");
  const observedAt=new Date().toISOString(),cutoff=new Date(Date.now()-(data.filters?.days??7)*86400000).toISOString().slice(0,10);
  const direction=[data.query,data.filters?.niche||brand?.industry,data.filters?.style,data.filters?.language,data.filters?.market,data.filters?.kind].filter(Boolean).join(' ');
  const terms=(data.query||data.filters?.niche||brand?.industry||'business').split(/\s+/).slice(0,3).join(' ');
  const platforms=data.filters?.platform==='TikTok'?['TikTok']:data.filters?.platform==='Instagram'?['Instagram Reels']:data.filters?.platform==='YouTube'?['YouTube Shorts']:data.filters?.platform==='Facebook'?['Facebook Reels']:['TikTok','Instagram Reels','YouTube Shorts','Facebook Reels'];
  async function runSearch(searchQueries:string[],objective:string,maxResults=20,strictRecency=true){
   const advanced_settings:Record<string,unknown>={max_results:maxResults};
   if(strictRecency) advanced_settings.source_policy={after_date:cutoff};
   const response=await fetch("https://connector-gateway.lovable.dev/parallel/v1/search",{method:"POST",headers:{Authorization:`Bearer ${appKey}`,"X-Connection-Api-Key":connectionKey,"Content-Type":"application/json"},body:JSON.stringify({mode:"advanced",objective,search_queries:searchQueries,advanced_settings})});
   if(!response.ok){console.warn("Trend research failed",response.status);return [] as unknown[];}
   const payload=await response.json() as {results?:unknown[];warnings?:unknown[]};
   if(payload.warnings?.length)console.warn('Trend search returned warnings',payload.warnings);
   return payload.results??[];
  }
  async function enrichTrend(trend:Trend):Promise<Trend|null>{
   const source=trendVideoSource(trend.url);if(!source)return null;
   if(source.platform==='TikTok'){
    try{
     const response=await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(trend.url)}`,{signal:AbortSignal.timeout(5000)});
     if(!response.ok)return trend;
     const data=await response.json() as {title?:unknown;author_name?:unknown;thumbnail_url?:unknown};
     const thumbnail=typeof data.thumbnail_url==='string'&&/^https:\/\//.test(data.thumbnail_url)?data.thumbnail_url:undefined;
     return {...trend,title:typeof data.title==='string'&&data.title.trim()?data.title:trend.title,creator:typeof data.author_name==='string'?data.author_name:trend.creator,thumbnail};
    }catch{return trend;}
   }
   if(source.platform==='YouTube'){
    try{
     const response=await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(trend.url)}&format=json`,{signal:AbortSignal.timeout(5000)});
     if(!response.ok)return trend;
     const data=await response.json() as {title?:unknown;author_name?:unknown;thumbnail_url?:unknown};
     return {...trend,title:typeof data.title==='string'&&data.title.trim()?data.title:trend.title,creator:typeof data.author_name==='string'?data.author_name:trend.creator,thumbnail:typeof data.thumbnail_url==='string'?data.thumbnail_url:trend.thumbnail};
    }catch{return trend;}
   }
   return trend;
  }
  const strictQueries=platforms.flatMap(platform=>[
   `${terms} ${platform} ${data.type}`,
   `${terms} ${platform} creator video`,
  ]).map(value=>value.slice(0,200));
  const directVideoQueries=[
   `site:tiktok.com/@ ${terms} video`,
   `site:instagram.com/reel ${terms}`,
   `site:youtube.com/shorts ${terms}`,
   `site:facebook.com/reel ${terms}`,
  ].map(value=>value.slice(0,200));
  const strictObjective=`Find genuinely high-traction original public short videos within the requested ${data.filters?.days??7} day window. Prioritize TikTok /@creator/video links, Instagram /reel links, YouTube /shorts links and Facebook /reel or /videos links. Search intent: ${direction}. Additional filters: ${JSON.stringify(data.filters)}. Brand context: ${JSON.stringify(brand)}. Treat brand context as personality, audience and creative-direction guidance, NOT a literal keyword requirement. Include adjacent formats that the audience could naturally adapt even when the video is not about the same industry. Prefer videos with explicit public evidence of meaningful traction (for example 50K+ views/plays, 2K+ likes, or stronger), widely repeated formats, or clearly documented viral momentum. Do not surface weak low-engagement examples merely because their keywords match. Never invent rankings, engagement, rights or dates.`;
  const firstResults=await runSearch([...strictQueries,...directVideoQueries],strictObjective,28);
  const broadTerms=[data.query,data.filters?.style,data.filters?.kind,brand?.target_audience,data.filters?.audience].filter(Boolean).join(' ')||brand?.industry||'business';
  const shouldBroaden=true;
  const broadQueries=platforms.flatMap(platform=>[
   `${broadTerms} ${platform} behind the scenes`,
   `${broadTerms} ${platform} tips`,
   `${broadTerms} ${platform} POV`,
   `${broadTerms} ${platform} storytelling`,
   `${broadTerms} ${platform} funny relatable`,
   `${broadTerms} ${platform} brand story`,
  ]).map(value=>value.slice(0,200));
  const broadResults=shouldBroaden?await runSearch(broadQueries,`Find additional high-traction original short videos creatively adaptable to this goal: ${data.query||direction||'business content ideas'}. Preserve platform and recency preferences, but broaden semantically to adjacent storytelling, cinematic process, behind-the-scenes, POV, educational, funny/relatable, transformation, testimonial, service-demo and brand-story formats. Brand fit should come from personality/audience similarity rather than direct industry keywords. Prefer explicit public evidence of strong traction and original creator/video URLs; avoid low-view examples when stronger evidence exists. Do not invent dates, engagement, rankings or audio rights.`,24):[];
  let combined=[...firstResults,...broadResults];
  let seen=new Set<string>();
  let observations=normalizeTrendResults(combined,observedAt,data.type,cutoff).filter(item=>{if(seen.has(item.url))return false;seen.add(item.url);return true;});
  let candidates=videoTrendResults(observations,data.filters?.platform).map(trend=>({...trend,searchContext:direction}));
  if(candidates.length===0){
   const fallbackQueries=[
    ...directVideoQueries,
    `${terms} TikTok reel short video`,
    `${terms} Instagram Reel creator`,
    `${terms} YouTube Short creator`,
    `${terms} Facebook Reel creator`,
   ].map(value=>value.slice(0,200));
   const fallbackResults=await runSearch(fallbackQueries,`Find original public short-form videos relevant to this creative search: ${data.query||direction||terms}. Prefer direct TikTok video, Instagram Reel, YouTube Shorts, and Facebook Reel/video URLs. High public traction is preferred when visible, but do not exclude a useful original video solely because the search result does not expose view/like counts or a publish date. Do not invent engagement, dates, rankings or audio rights.`,36,false);
   combined=[...combined,...fallbackResults];
   seen=new Set<string>();
   observations=normalizeTrendResults(combined,observedAt,data.type,cutoff).filter(item=>{if(seen.has(item.url))return false;seen.add(item.url);return true;});
   candidates=videoTrendResults(observations,data.filters?.platform).map(trend=>({...trend,searchContext:direction}));
  }
  const enriched=(await Promise.all(candidates.slice(0,36).map(enrichTrend)))
    .filter((trend):trend is Trend=>Boolean(trend))
    .sort((a,b)=>(b.viralStrength??0)-(a.viralStrength??0))
    .slice(0,12);
  const supporting=observations.filter(item=>!videoTrendResults([item]).length);
  return {trends:enriched,supporting,observedAt,message:enriched.length?`${enriched.length} public video idea${enriched.length===1?'':'s'} found · traction is shown only when publicly available · dates may be unreported · audio rights remain unverified.`:"No usable original videos matched yet. Try a broader phrase or another platform filter."};
 });