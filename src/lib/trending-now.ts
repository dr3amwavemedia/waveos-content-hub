export type Trend = {id:string;title:string;url:string;source:string;excerpt:string;publishedAt:string|null;observedAt:string;type:"audio"|"format"|"hook"|"topic";status:"unknown";licensing:"unknown"|"not_applicable";platform?:"TikTok"|"Instagram"|"YouTube"|"Facebook";embedUrl?:string;thumbnail?:string;creator?:string;searchContext?:string;engagementEvidence?:string;viralStrength?:number};
export type TrendFilters={platform:string;style:string;language:string;market:string;niche:string;businessType:string;audience:string;days:number;kind:string};
export const DEFAULT_TREND_FILTERS:TrendFilters={platform:"All videos",style:"Any style",language:"Any language",market:"",niche:"",businessType:"",audience:"",days:7,kind:"Any type"};
export function trendVideoSource(raw:string):{platform:Trend["platform"];embedUrl?:string}|null{
 try{
  const url=new URL(raw),host=url.hostname.replace(/^www\./,'');
  const path=url.pathname.replace(/\/+$/,'');
  if((host==='tiktok.com'||host==='m.tiktok.com')&&/^\/@[^/]+\/video\/\d+$/.test(path))return {platform:'TikTok'};
  if(host==='vm.tiktok.com'&&/^\/[A-Za-z0-9_-]+$/.test(path))return {platform:'TikTok'};
  if((host==='instagram.com'||host==='m.instagram.com')&&/^\/reels?\/[A-Za-z0-9_-]+$/.test(path))return {platform:'Instagram'};
  if(host==='facebook.com'||host==='m.facebook.com'){
   if(/^\/reel\/[^/]+$/.test(path)||/\/videos\/[^/]+$/.test(path)||/^\/share\/r\/[^/]+$/.test(path)||path==='/watch'){
    return {platform:'Facebook'};
   }
  }
  let id:string|undefined;
  if(host==='youtube.com'){
   if(/^\/shorts\/[A-Za-z0-9_-]{11}$/.test(path))id=path.split('/')[2];
   else if(path==='/watch'&&/^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v')??''))id=url.searchParams.get('v')??undefined;
  }else if(host==='youtu.be'&&/^\/[A-Za-z0-9_-]{11}$/.test(path)){
   id=path.slice(1);
  }
  if(id)return {platform:'YouTube',embedUrl:`https://www.youtube-nocookie.com/embed/${id}`};
 }catch{/* Invalid source. */}
 return null;
}
export function videoTrendResults(trends:Trend[],platform='All videos'){
 return trends.flatMap(trend=>{const source=trendVideoSource(trend.url);return source&&(platform==='All videos'||source.platform===platform)?[{...trend,...source}]:[];});
}
export const TREND_VIEWS=["For You","Trending Audio","Viral Formats","Trending Hooks","Industry Ideas","Saved Trends"] as const;
export type TrendView=typeof TREND_VIEWS[number];
export function tiktokPublishedAt(raw:string):string|null{
 try{const url=new URL(raw),host=url.hostname.replace(/^www\./,'');if(host!=='tiktok.com')return null;const match=url.pathname.match(/\/video\/(\d+)/);if(!match)return null;const seconds=Number(BigInt(match[1])>>32n);if(!Number.isFinite(seconds)||seconds<=0)return null;const date=new Date(seconds*1000);return Number.isNaN(date.getTime())?null:date.toISOString();}catch{return null;}
}
function excerptPublishedAt(excerpt:string):string|null{
 const match=excerpt.match(/\bon\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\b/);if(!match)return null;const parsed=Date.parse(match[1]);return Number.isNaN(parsed)?null:new Date(parsed).toISOString();
}
function safeHttpsUrl(raw:string):string|null{
 try{
  const parsed=new URL(raw);
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.port||!parsed.hostname.includes(".")||/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(parsed.hostname))return null;
  return parsed.href;
 }catch{return null;}
}
function embeddedVideoUrls(text:string){
 const matches=text.match(/https:\/\/(?:www\.|m\.)?(?:tiktok\.com\/@[^\s"'<>]+\/video\/\d+|instagram\.com\/reels?\/[A-Za-z0-9_-]+\/?|youtube\.com\/shorts\/[A-Za-z0-9_-]{11}|youtu\.be\/[A-Za-z0-9_-]{11}|facebook\.com\/(?:reel\/[^\s"'<>/?#]+|share\/r\/[^\s"'<>/?#]+|[^\s"'<>]+\/videos\/[^\s"'<>/?#]+))/gi)??[];
 return [...new Set(matches.map(value=>value.replace(/[),.;!?]+$/,"")).map(value=>safeHttpsUrl(value)).filter((value):value is string=>Boolean(value)).filter(value=>Boolean(trendVideoSource(value))))];
}
export function normalizeTrendResults(results:unknown[],observedAt:string,type:Trend["type"],cutoff:string):Trend[]{
 return results.flatMap(item=>{
  if(!item || typeof item!=="object")return [];const row=item as Record<string,unknown>;
  const title=typeof row.title==="string"&&row.title.trim()?row.title.trim():"Public short-form video";
  const excerpts=Array.isArray(row.excerpts)?row.excerpts.filter((text):text is string=>typeof text==="string").join("\n"):"";
  const topLevel=typeof row.url==="string"?safeHttpsUrl(row.url):null;
  const candidateUrls=[...(topLevel&&trendVideoSource(topLevel)?[topLevel]:[]),...embeddedVideoUrls([typeof row.url==="string"?row.url:"",title,excerpts].join("\n"))];
  const uniqueCandidates=[...new Set(candidateUrls)];
  if(!uniqueCandidates.length)return [];
  const reportedDate=typeof row.publish_date==="string"&&!Number.isNaN(Date.parse(row.publish_date))?row.publish_date:null;
  const thumbnailCandidate=[row.thumbnail_url,row.thumbnail,row.image_url,row.image].find(value=>typeof value==="string"&&/^https:\/\//i.test(value as string));
  const metricText=`${title} ${excerpts}`;
  const metricMatches=[...metricText.matchAll(/(\d+(?:\.\d+)?)\s*([KMB])?\s*(views?|likes?|plays?)/gi)];
  const units:Record<string,number>={K:1_000,M:1_000_000,B:1_000_000_000};
  let viralStrength=0;const evidence:string[]=[];
  for(const match of metricMatches){
    const value=Number(match[1])*(match[2]?units[match[2].toUpperCase()]??1:1);
    const kind=match[3].toLowerCase(); evidence.push(`${match[1]}${match[2]??""} ${match[3]}`);
    if(kind.startsWith("view")||kind.startsWith("play")) viralStrength=Math.max(viralStrength,value>=1_000_000?4:value>=250_000?3:value>=50_000?2:value>=10_000?1:0);
    if(kind.startsWith("like")) viralStrength=Math.max(viralStrength,value>=50_000?4:value>=10_000?3:value>=2_000?2:value>=500?1:0);
  }
  return uniqueCandidates.flatMap(url=>{
    const publishedAt=reportedDate??tiktokPublishedAt(url)??excerptPublishedAt(excerpts);
    if(publishedAt&&(Date.parse(publishedAt)<Date.parse(cutoff)||Date.parse(publishedAt)>Date.parse(observedAt)))return [];
    const videoSource=trendVideoSource(url);if(!videoSource)return [];
    return [{id:url,title,url,source:new URL(url).hostname,excerpt:excerpts,publishedAt,observedAt,type,status:"unknown" as const,licensing:type==="audio"?"unknown" as const:"not_applicable" as const,thumbnail:typeof thumbnailCandidate==="string"?thumbnailCandidate:undefined,engagementEvidence:evidence.slice(0,3).join(" · ")||undefined,viralStrength}];
  });
 });
}
export function trendIsStale(trend:Trend,now=Date.now()){return !trend.publishedAt || now-Date.parse(trend.publishedAt)>7*86400000;}
export function trendDraftBrief(trend:Trend,business:string){
 const outline=trend.type==='hook'?'Open with a question your customers actually ask → demonstrate your answer → invite a conversation.':trend.type==='audio'?'Film your own service in three moments → match the rhythm using your own cleared audio → reveal the finished work.':trend.type==='format'?'Show the starting point → capture the process in your own style → reveal the result.':'Introduce a real customer need → show your own approach → offer a next step.';
 return `Original content idea for ${business}\n\nSuggested hook: A closer look at ${business} — from our perspective.\n\nPublic inspiration: ${trend.title}\nSource: ${trend.url}\nPublished: ${trend.publishedAt??"Not reported"}\nObserved: ${trend.observedAt}\n${trend.searchContext?`Creative direction: ${trend.searchContext}\n`:''}\nSuggested shot outline: ${outline}\nWrite an original caption using your verified services and preferred CTA. Do not copy source content or claim trend performance.\n${trend.type==="audio"?"Audio rights are unverified. Use your own licensed audio; popularity is not commercial clearance.":"No audio clearance is implied."}`;
}