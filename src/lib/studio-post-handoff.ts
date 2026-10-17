export type StudioPostSnapshot = {workspaceId:string;id?:string;title:string;caption:string;platforms:string[];pickedMedia:string[];scheduledAt:string;platformOptions:Record<string,unknown>};
export function studioReturnedMedia(snapshot:StudioPostSnapshot,assetId?:string){
  return assetId ? [...snapshot.pickedMedia,assetId].filter((id,index,all)=>all.indexOf(id)===index) : snapshot.pickedMedia;
}
export function studioPostKey(workspaceId:string,token:string){return `waveos-studio-post-${workspaceId}-${token}`;}