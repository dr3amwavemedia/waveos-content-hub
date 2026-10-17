export type Trend = {id:string;title:string;url:string;source:string;excerpt:string;publishedAt:string|null;observedAt:string;type:"audio"|"format"|"hook"|"topic";status:"unknown";licensing:"unknown"|"not_applicable";platform?:"TikTok"|"Instagram"|"YouTube";embedUrl?:string;thumbnail?:string;creator?:string;searchContext?:string};
export type TrendFilters={platform:string;style:string;language:string;market:string;niche:string;businessType:string;audience:string;days:number;kind:string};
export const DEFAULT_TREND_FILTERS:TrendFilters={platform:"All videos",style:"Any style",language:"Any language",market:"",niche:"",businessType:"",audience:"",days:7,kind:"Any type"};
export function trendVideoSource(raw:string):{platform:Trend["platform"];embedUrl?:string}|null{
 try{const url=new URL(raw),host=url.hostname.replace(/^www\./,'');
 if(host==='tiktok.com'&&/^\/@[^/]+\/video\/\d+\/?$/.test(url.pathname))return {platform:'TikTok'};
 if(host==='instagram.com'&&/^\/reels?\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))return {platform:'Instagram'};
 const id=host==='youtube.com'&&/^\/shorts\/[A-Za-z0-9_-]{11}\/?$/.test(url.pathname)?url.pathname.split('/')[2]:undefined;
 if(id)return {platform:'YouTube',embedUrl:`https://www.youtube-nocookie.com/embed/${id}`};
 }catch{/* Invalid source. */}return null;
}
export function videoTrendResults(trends:Trend[],platform='All videos'){
 return trends.flatMap(trend=>{const source=trendVideoSource(trend.url);return source&&(platform==='All videos'||source.platform===platform)?[{...trend,...source}]:[];});
}
export const TREND_VIEWS=["For You","Trending Audio","Viral Formats","Trending Hooks","Industry Ideas","Saved Trends"] as const;
export type TrendView=typeof TREND_VIEWS[number];
export function normalizeTrendResults(results:unknown[],observedAt:string,type:Trend["type"],cutoff:string):Trend[]{
 return results.flatMap(item=>{
  if(!item || typeof item!=="object")return [];const row=item as Record<string,unknown>;
  if(typeof row.url!=="string"||typeof row.title!=="string")return [];
  let url:string;try{const parsed=new URL(row.url);if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.port||!parsed.hostname.includes(".")||/^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(parsed.hostname))return [];url=parsed.href;}catch{return [];}
  const publishedAt=typeof row.publish_date==="string"&&!Number.isNaN(Date.parse(row.publish_date))?row.publish_date:null;
  // Undated pages are not evidence of current trends. Never fill a feed
  // with old rankings just because they were fetched today.
  if(!publishedAt||Date.parse(publishedAt)<Date.parse(cutoff)||Date.parse(publishedAt)>Date.parse(observedAt))return [];
  const excerpts=Array.isArray(row.excerpts)?row.excerpts.filter((text):text is string=>typeof text==="string").join("\n"):"";
  // A dated unrelated article is not a social trend observation.
  if(!trendVideoSource(url)&&!/social media|instagram|tiktok|reels|youtube shorts|trending audio|viral format/i.test(`${row.title} ${excerpts}`))return [];
  return [{id:url,title:row.title,url,source:new URL(url).hostname,excerpt:excerpts,publishedAt,observedAt,type,status:"unknown" as const,licensing:type==="audio"?"unknown" as const:"not_applicable" as const}];
 });
}
export function trendIsStale(trend:Trend,now=Date.now()){return !trend.publishedAt || now-Date.parse(trend.publishedAt)>7*86400000;}
export function trendDraftBrief(trend:Trend,business:string){
 const outline=trend.type==='hook'?'Open with a question your customers actually ask → demonstrate your answer → invite a conversation.':trend.type==='audio'?'Film your own service in three moments → match the rhythm using your own cleared audio → reveal the finished work.':trend.type==='format'?'Show the starting point → capture the process in your own style → reveal the result.':'Introduce a real customer need → show your own approach → offer a next step.';
 return `Original content idea for ${business}\n\nSuggested hook: A closer look at ${business} — from our perspective.\n\nPublic inspiration: ${trend.title}\nSource: ${trend.url}\nPublished: ${trend.publishedAt??"Not reported"}\nObserved: ${trend.observedAt}\n${trend.searchContext?`Creative direction: ${trend.searchContext}\n`:''}\nSuggested shot outline: ${outline}\nWrite an original caption using your verified services and preferred CTA. Do not copy source content or claim trend performance.\n${trend.type==="audio"?"Audio rights are unverified. Use your own licensed audio; popularity is not commercial clearance.":"No audio clearance is implied."}`;
}