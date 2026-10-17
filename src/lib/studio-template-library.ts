import cafe from "@/assets/templates/cafe.jpg";
import filmmaker from "@/assets/templates/filmmaker.jpg";
import workshop from "@/assets/templates/workshop.jpg";
import salon from "@/assets/templates/salon.jpg";
import { STUDIO_FORMATS, type DesignDocument, type DesignElement, type DesignFormat, type TextElement } from "./studio-template-model";
// Artwork colors are document data, not application UI theme colors.
const ink = "#141918", paper = "#f7f5ef", cyan = "#35d5e6", sage = "#7d9f8a";
export const TEMPLATE_LIBRARY = [
  {id:"come-in",name:"Come on in",category:"Minimal Story",photo:cafe,style:"invitation"},
  {id:"open",name:"We're open",category:"Business",photo:cafe,style:"open"},
  {id:"story",name:"Stories that connect",category:"Organic / cinematic",photo:filmmaker,style:"cinematic"},
  {id:"behind",name:"Behind the scenes",category:"Photo-first",photo:filmmaker,style:"behind"},
  {id:"process",name:"Plan. Create. Deliver.",category:"Business",photo:workshop,style:"process"},
  {id:"quote",name:"Client voices",category:"Testimonial",photo:salon,style:"quote"},
  {id:"trades",name:"Built different",category:"Trades",photo:workshop,style:"trades"},
  {id:"craft",name:"Your work deserves great content",category:"Trades",photo:workshop,style:"craft"},
  {id:"beauty",name:"Beauty stories",category:"Beauty / wellness",photo:salon,style:"beauty"},
  {id:"wellness",name:"Room to recharge",category:"Beauty / wellness",photo:salon,style:"wellness"},
  {id:"services",name:"Our services",category:"Promotional",photo:filmmaker,style:"services"},
  {id:"booking",name:"Now booking",category:"Promotional",photo:filmmaker,style:"booking"},
  {id:"today",name:"A little moment for you",category:"Minimal Story",photo:cafe,style:"today"},
  {id:"community",name:"Made for our community",category:"Photo-first",photo:cafe,style:"community"},
] as const;
export type StudioTemplate = typeof TEMPLATE_LIBRARY[number];
export function createStudioTemplate(template:StudioTemplate, format:DesignFormat):DesignDocument {
  const {width:w,height:h} = STUDIO_FORMATS[format]; const scale = format === "story" ? 1 : format === "portrait" ? .92 : .8;
  const elements:DesignElement[]=[]; let sequence=0;
  const base=(name:string,x:number,y:number)=>({id:`${template.id}-${++sequence}`,name,x,y,opacity:1,rotation:0});
  const shape=(name:string,x:number,y:number,width:number,height:number,color:string,opacity=1,brandRole?:"primary"|"secondary")=>elements.push({...base(name,x,y),type:"shape",shape:"rectangle",width:w*width,height:h*height,color,opacity,brandRole});
  const text=(name:string,content:string,x:number,y:number,size:number,font="DM Sans",color=paper,align:CanvasTextAlign="left",weight:TextElement["fontWeight"]=400,role:TextElement["fontRole"]="body",brandRole?:"primary"|"secondary")=>elements.push({...base(name,x,y),type:"text",text:content,fontSize:size*scale,fontFamily:font,fontWeight:weight,align,color,fontRole:role,brandRole});
  const cropWidth=Math.min(1,(w/h)/(2/3));const cropHeight=Math.min(1,(2/3)/(w/h));
  elements.push({...base("Replaceable editorial photo",.5,.5),type:"image",sourceType:"media",assetId:null,templateUrl:template.photo,width:w,height:h,crop:{x:(1-cropWidth)/2,y:(1-cropHeight)/2,width:cropWidth,height:cropHeight}});
  const editorial=["quote","beauty","wellness"].includes(template.style);
  if(editorial){shape("Editorial paper panel",.24,.5,.48,1,paper,.96);text("Brand placeholder","YOUR BRAND",.06,.065,28,"Manrope",ink);}
  else {shape("Cinematic contrast overlay",.5,.5,1,1,ink,.28);shape("Lower photo shade",.5,.84,1,.32,ink,.75);text("Brand placeholder","YOUR BRAND",.07,.065,27,"Manrope");}
  // Logo is an independent editable graphic placeholder; Apply My Brand substitutes the workspace logo.
  elements.push({...base("Logo placeholder",.87,.065),type:"image",sourceType:"media",assetId:null,templateUrl:`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><path d="M8 24V8h30M122 8h30v16M8 66v16h30M122 82h30V66" fill="none" stroke="white" stroke-width="3"/><text x="80" y="55" fill="white" font-family="Arial" font-size="28" text-anchor="middle">LOGO</text></svg>')}`,width:130,height:74,brandRole:"logo"});
  switch(template.style){
    case "invitation":text("Invitation","Come\non in",.5,.40,160,"Caveat",paper,"center",600,"accent");text("Availability","A LITTLE MOMENT FOR YOU",.5,.66,29,"Manrope",paper,"center");shape("Brand accent",.5,.72,.4,.003,cyan,1,"primary");break;
    case "open":text("Eyebrow","GOOD PEOPLE. GREAT COFFEE.",.5,.29,28,"Manrope",paper,"center");text("Headline","We're\nOpen",.5,.48,145,"Cormorant Garamond",paper,"center",600,"heading");text("Invitation","COME BY TODAY",.5,.71,33,"Manrope",paper,"center");break;
    case "cinematic":text("Headline","BRAND\nSTORIES",.075,.56,118,"Barlow Condensed",paper,"left",700,"heading");text("Accent","that connect",.08,.72,92,"Caveat",cyan,"left",400,"accent","primary");break;
    case "behind":text("Headline","BEHIND\nTHE SCENES",.08,.64,93,"Manrope",paper,"left",700,"heading");text("Caption","More than a moment.\nThe story behind the work.",.08,.82,35);break;
    case "process":text("Headline","Plan.\nCreate.\nDeliver.",.1,.43,130,"Caveat",paper,"left",600,"accent");text("Caption","THOUGHTFUL WORK. REAL RESULTS.",.1,.84,28);break;
    case "quote":text("Quote mark","“",.05,.23,160,"Cormorant Garamond",sage);text("Quote","Great people.\nThoughtful work.\nA story worth\nsharing.",.05,.47,61,"Cormorant Garamond",ink,"left",400,"heading");text("Attribution","YOUR CLIENT NAME\nCLIENT STORY",.06,.74,23,"Manrope",ink);break;
    case "trades":text("Headline","TRADES",.08,.36,125,"Barlow Condensed",paper,"left",700,"heading");text("Accent","BUILT",.08,.47,145,"Barlow Condensed",cyan,"left",700,"accent","primary");text("Headline ending","DIFFERENT",.08,.59,112,"Barlow Condensed",paper,"left",700,"heading");text("Caption","SHOW THE CRAFT.\nTELL THE STORY.",.08,.76,34);break;
    case "craft":text("Headline","YOUR WORK\nDESERVES",.08,.39,95,"Barlow Condensed",paper,"left",700,"heading");text("Accent","GREAT\nCONTENT",.08,.59,104,"Barlow Condensed",cyan,"left",700,"accent","primary");break;
    case "beauty":text("Headline","Beauty\nStories\nThat",.055,.35,87,"Cormorant Garamond",ink,"left",400,"heading");text("Accent","Connect",.055,.55,85,"Caveat",sage,"left",400,"accent","primary");text("Caption","YOUR BUSINESS.\nYOUR UNIQUE STORY.",.06,.71,25,"Manrope",ink);break;
    case "wellness":text("Headline","Room to\nrecharge.",.05,.39,83,"Cormorant Garamond",ink,"left",400,"heading");text("Caption","A LITTLE CARE.\nA FRESH BEGINNING.",.055,.62,25,"Manrope",ink);break;
    case "services":text("Headline","OUR",.07,.24,122,"Barlow Condensed",paper,"left",700,"heading");text("Accent","SERVICES",.07,.35,122,"Barlow Condensed",cyan,"left",700,"heading","primary");text("Service list","01   YOUR FIRST SERVICE\n02   YOUR SECOND SERVICE\n03   YOUR SIGNATURE SERVICE",.07,.57,35,"Manrope");text("CTA","LET'S CREATE SOMETHING GREAT",.07,.81,28);break;
    case "booking":text("Headline","NOW",.075,.38,185,"Barlow Condensed",paper,"left",700,"heading");text("Accent","Booking",.075,.56,156,"Caveat",cyan,"left",600,"accent","primary");text("Caption","YOUR NEXT CHAPTER STARTS HERE",.075,.75,30);break;
    case "today":text("Headline","A little\nmoment\nfor you.",.5,.43,114,"Cormorant Garamond",paper,"center",400,"heading");text("Caption","COME BY TODAY",.5,.73,28,"Manrope",paper,"center");break;
    case "community":text("Headline","Made for\nour community.",.07,.51,108,"Manrope",paper,"left",600,"heading");text("Caption","LOCAL PEOPLE. REAL STORIES.",.07,.73,28);break;
  }
  shape("Brand footer accent",.07,.9,.025,.055,editorial?sage:cyan,1,"primary");
  text("Footer",editorial?"BOOK YOUR MOMENT":"YOUR STORY STARTS HERE",.11,.90,24,"Manrope",editorial?ink:paper);
  text("Editable arrow icon","↗",.88,.9,60,"DM Sans",editorial?ink:paper,"center",400,"body");
  return {version:1,format,background:ink,elements};
}
