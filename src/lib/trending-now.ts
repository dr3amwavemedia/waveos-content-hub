export type Trend = {id:string;title:string;url:string;source:string;excerpt:string;publishedAt:string|null;observedAt:string;type:"audio"|"format"|"hook"|"topic";status:"unknown";licensing:"unknown"|"not_applicable"};
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
  if(!/social media|instagram|tiktok|reels|trending audio|viral format/i.test(`${row.title} ${excerpts}`))return [];
  return [{id:url,title:row.title,url,source:new URL(url).hostname,excerpt:excerpts,publishedAt,observedAt,type,status:"unknown" as const,licensing:type==="audio"?"unknown" as const:"not_applicable" as const}];
 });
}
export function trendIsStale(trend:Trend,now=Date.now()){return !trend.publishedAt || now-Date.parse(trend.publishedAt)>7*86400000;}
export function trendDraftBrief(trend:Trend,business:string){
 return `Original content idea for ${business}\n\nSuggested hook: A closer look at ${business} — from our perspective.\n\nPublic inspiration: ${trend.title}\nSource: ${trend.url}\nPublished: ${trend.publishedAt??"Not reported"}\nObserved: ${trend.observedAt}\n\nSuggested shot outline: Establish the setting → show your own process → reveal the result.\nWrite an original caption using your verified services and preferred CTA. Do not copy source content or claim trend performance.\n${trend.type==="audio"?"Audio rights are unverified. Use your own licensed audio; popularity is not commercial clearance.":"No audio clearance is implied."}`;
}