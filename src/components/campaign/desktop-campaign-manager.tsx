import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Check,
  Clock3,
  Loader2,
  Megaphone,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
  Images,
  FolderOpen,
  Video,
  CheckCircle2,
  FileText,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { MediaPicker } from "@/routes/_authenticated/create";
import { UnsavedChangesGuard } from "@/components/app/unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { CampaignTranscripts } from "@/components/media/campaign-transcripts";
import { MobileWorkflowSteps, MobileWorkflowSection, MobileWorkflowFooter } from "@/components/app/mobile-workflow";
import { CAMPAIGN_GOALS, type CampaignGoal } from "@/lib/phase-one-planning";
import { cn } from "@/lib/utils";
import { getMediaPreviewUrl, type MediaAsset } from "@/hooks/use-media";
import {
  DAY_OPTIONS,
  DEFAULT_INPUT,
  PLATFORM_OPTIONS,
  type CampaignManagerController,
} from "@/components/campaign/use-campaign-manager";

/** Existing WaveOS Intelligence desktop layout, driven by the shared campaign logic. */
export function DesktopCampaignManager({ controller }: { controller: CampaignManagerController }) {
  const {
    input,
    setInput,
    preview,
    setPreview,
    dirty,
    setDirty,
    autoSaveState,
    setAutoSaveState,
    campaignDirection,
    setCampaignDirection,
    analysisProgress,
    setAnalysisProgress,
    selectedMediaIds,
    setSelectedMediaIds,
    confirmedMediaIds,
    setConfirmedMediaIds,
    showSharedMediaPicker,
    setShowSharedMediaPicker,
    mediaFolder,
    setMediaFolder,
    directionBusy,
    setDirectionBusy,
    selectedCampaignId,
    setSelectedCampaignId,
    mediaSectionOpen,
    setMediaSectionOpen,
    bulkCaptionBusy,
    setBulkCaptionBusy,
    captionBusyId,
    setCaptionBusyId,
    campaignCaptionDrafts,
    setCampaignCaptionDrafts,
    continuedFrom,
    setContinuedFrom,
    savedNotice,
    setSavedNotice,
    workspaceId,
    queryClient,
    editRevisionRef,
    campaignDirectionFn,
    saveCorrectionsFn,
    captionAssistFn,
    mediaInputRef,
    mediaFolders,
    mediaAssets,
    allMediaAssets,
    uploadMedia,
    workflowDraft,
    autoSaveDraft,
    campaigns,
    linkedCampaignContent,
    assetLookup,
    campaignContentByPlan,
    selectedCampaign,
    selectedCampaignContent,
    selectedCampaignCounts,
    errors,
    sequenceMediaIds,
    builderState,
    stepCompletion,
    launchBlocker,
    savePlan,
    toggleList,
    changeSelectedMedia,
    uploadCampaignFiles,
    extractVideoFrames,
    saveCampaignCaption,
    generateCampaignCaption,
    generateMissingCampaignCaptions,
    continueSavedCampaign,
    generateDirection,
    updateMediaRecommendation,
    moveSequenceItem,
    saveServerDraft,
    generatePlan,
    goToStep,
    startNewCampaign,
    activeWorkspace,
    update,
    draftsBusy,
    setDraftsBusy,
    draftsCreated,
    setDraftsCreated,
    createPostDrafts,
    restoreServerDraft,
  } = controller;
  const [mobileStep, setMobileStep] = useState(0);
  const mobileSteps = ["Campaign name", "Your goal", "Platforms & formats", "Posting frequency", "Planning schedule", "Review campaign"];

  if (!activeWorkspace) return null;

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard dirty={dirty} subject="this campaign plan" />
      <header className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-purple-500/5 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Megaphone className="h-4 w-4" /> Campaign intelligence
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Build a campaign from your content</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Choose the content you already have, then let WaveOS use your brand and performance history to recommend what to post, where, when, and how to caption it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-muted-foreground" role="status">{autoSaveState==="saving"?"Saving draft…":autoSaveState==="saved"?"Draft saved":autoSaveState==="error"?"Auto-save paused":""}</span>
          <Button
            variant="outline"
            onClick={() => void saveServerDraft()}
            disabled={workflowDraft.save.isPending}
          >
            {workflowDraft.save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save draft
          </Button>
          <Button onClick={() => void generateDirection()} disabled={!input.platforms.length || directionBusy || selectedMediaIds.length===0}>
            {directionBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} Analyze & Build Campaign
          </Button>
          <Button className="hidden sm:inline-flex" onClick={generatePlan} disabled={errors.length > 0}>
            <Sparkles /> Build plan
          </Button>
        </div>
        </div>
      </header>

      <section className="rounded-2xl border border-primary/20 bg-[linear-gradient(145deg,rgba(8,35,60,.92),rgba(28,20,59,.9))] p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <ListChecks className="h-4 w-4" /> Campaign command center
            </div>
            <h2 className="mt-1 text-xl font-semibold">Keep building after the plan is saved</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Reopen a campaign, see its linked posts, and move each piece from draft to review,
              approval, scheduling, and published content.
            </p>
          </div>
          <Button variant="outline" onClick={() => {
            setSelectedCampaignId(null);
            setInput(DEFAULT_INPUT);
            setSelectedMediaIds([]);
            setCampaignDirection(null);
            setPreview([]);
            setMobileStep(0);
          }}>
            <Megaphone /> New campaign
          </Button>
        </div>

        {(campaigns.data ?? []).length > 0 ? (
          <>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {(campaigns.data ?? []).map((campaign) => {
                const contentCount = campaignContentByPlan.get(campaign.id)?.length ?? 0;
                const active = selectedCampaignId === campaign.id;
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      setSelectedCampaignId(campaign.id);
                      window.requestAnimationFrame(() => {
                        document.getElementById("campaign-command-detail")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      });
                    }}
                    className={cn(
                      "min-w-[15rem] rounded-xl border p-3 text-left transition-colors",
                      active
                        ? "border-primary/50 bg-primary/15"
                        : "border-border bg-background/35 hover:border-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{campaign.name}</span>
                      <span className="rounded-full bg-black/20 px-2 py-1 text-[9px] uppercase text-muted-foreground">
                        {campaign.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {contentCount} linked post{contentCount === 1 ? "" : "s"} · {campaign.max_posts} max
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {campaign.start_date} → {campaign.end_date}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary">
                      Tap to open <ArrowRight className="h-3 w-3" />
                    </p>
                  </button>
                );
              })}
            </div>

            {selectedCampaign && (
              <div id="campaign-command-detail" className="scroll-mt-24 mt-3 rounded-2xl border border-primary/15 bg-background/35 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold">{selectedCampaign.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground capitalize">
                      {selectedCampaign.goal} · {selectedCampaign.platforms.join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => continueSavedCampaign(selectedCampaign)}>
                      <ArrowRight /> Continue building
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={bulkCaptionBusy || !selectedCampaignContent.some((item) => !item.primary_caption?.trim())}
                      onClick={() => void generateMissingCampaignCaptions()}
                    >
                      {bulkCaptionBusy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                      Generate missing captions
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/content"><Images /> Content library</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/calendar"><CalendarDays /> Calendar</Link>
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[
                    ["Linked", selectedCampaignCounts.total],
                    ["Draft", selectedCampaignCounts.drafts],
                    ["Review", selectedCampaignCounts.review],
                    ["Approved", selectedCampaignCounts.approved],
                    ["Scheduled", selectedCampaignCounts.scheduled],
                    ["Published", selectedCampaignCounts.published],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-border bg-black/10 p-2 text-center">
                      <p className="text-lg font-semibold">{value}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {selectedCampaignContent.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Campaign captions</p>
                        <p className="text-xs text-muted-foreground">Generate, rewrite, edit, and save each caption without leaving Campaign Manager.</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {selectedCampaignContent.filter((item) => item.primary_caption?.trim()).length}/{selectedCampaignContent.length} ready
                      </span>
                    </div>
                    {selectedCampaignContent.slice(0, 12).map((item, index) => {
                      const caption = campaignCaptionDrafts[item.id] ?? item.primary_caption ?? "";
                      const savedCaption = item.primary_caption ?? "";
                      const changed = caption.trim() !== savedCaption.trim();
                      return (
                        <article key={item.id} className="rounded-2xl border border-border bg-surface/50 p-3">
                          <div className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{item.title || `Campaign post ${index + 1}`}</p>
                              <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                                {typeof item.metadata?.platform === "string" ? item.metadata.platform : "Platform TBD"}
                                {typeof item.metadata?.plannedDate === "string" ? ` · ${item.metadata.plannedDate}` : ""}
                                {typeof item.metadata?.plannedTime === "string" ? ` ${item.metadata.plannedTime}` : ""}
                              </p>
                            </div>
                            <span className="rounded-full bg-background/50 px-2 py-1 text-[10px] uppercase text-muted-foreground">
                              {item.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <textarea
                            value={caption}
                            onChange={(event) =>
                              setCampaignCaptionDrafts((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            rows={4}
                            placeholder="Generate a Brand Voice caption or write one here…"
                            className="mt-3 w-full resize-y rounded-xl border border-border bg-background/50 px-3 py-2 text-sm leading-6 outline-none focus:border-primary/50"
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant={item.primary_caption ? "outline" : "secondary"}
                              disabled={captionBusyId === item.id}
                              onClick={() => void generateCampaignCaption(item)}
                            >
                              {captionBusyId === item.id ? <Loader2 className="animate-spin" /> : <Sparkles />}
                              {item.primary_caption ? "Rewrite" : "Generate caption"}
                            </Button>
                            <Button
                              size="sm"
                              disabled={!caption.trim() || !changed || captionBusyId === item.id}
                              onClick={() => void saveCampaignCaption(item, caption)}
                            >
                              <Save /> Save caption
                            </Button>
                            <Button asChild size="sm" variant="ghost">
                              <Link
                                to="/create"
                                search={{
                                  id: item.id,
                                  media: undefined,
                                  studio: undefined,
                                  destination: undefined,
                                  brief: undefined,
                                  briefWorkspace: undefined,
                                }}
                              >
                                Open full post <ArrowRight />
                              </Link>
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                    {selectedCampaignContent.length > 12 && (
                      <p className="px-1 text-xs text-muted-foreground">
                        +{selectedCampaignContent.length - 12} more linked posts in the Content Library.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    This campaign does not have linked content yet. Choose media below, then analyze
                    the campaign or create linked drafts so the workflow can continue.
                  </div>
                )}

                <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next step</p>
                  <p className="mt-1 text-sm">
                    {selectedCampaignCounts.total === 0
                      ? "Attach content and build the campaign direction."
                      : selectedCampaignCounts.drafts > 0
                        ? "Finish or approve the captions here, then open any post that needs final media/platform review."
                        : selectedCampaignCounts.review > 0
                          ? "Review the submitted posts and approve or request changes."
                          : selectedCampaignCounts.approved > 0
                            ? "Schedule the approved posts on the campaign calendar."
                            : selectedCampaignCounts.scheduled > 0
                              ? "The campaign is scheduled. Monitor publishing and performance."
                              : "Review the published campaign and use the results for the next one."}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : campaigns.isError ? (
          <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/5 p-5 text-sm text-amber-100">
            WaveOS could not load your saved campaigns. Your campaigns were not deleted. Refresh this
            page or try again in a moment.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            No saved campaigns were returned for this workspace. Build a campaign below, or refresh if
            you expected an existing campaign to appear.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface/70 p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setMediaSectionOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={mediaSectionOpen}
        >
          <div>
            <div className="flex items-center gap-2 font-semibold"><Images className="h-4 w-4 text-primary" /> Campaign content</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedMediaIds.length
                ? `${selectedMediaIds.length} piece${selectedMediaIds.length === 1 ? "" : "s"} selected · tap to change`
                : "Choose a folder or select individual photos/videos when you're ready."}
            </p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/50">
            {mediaSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {mediaSectionOpen && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Choose campaign media</p>
                <p className="mt-1 text-xs text-muted-foreground">Select multiple photos/videos from a folder or upload new pieces.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={()=>setShowSharedMediaPicker(true)}>
                  <Images className="h-4 w-4" /> Drive / Dropbox / Frame.io
                </Button>
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  {uploadMedia.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload media
                  <input ref={mediaInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.mp4,.mov,image/jpeg,image/png,video/mp4,video/quicktime" className="hidden" onChange={async(e)=>{const inputEl=e.currentTarget; const files=Array.from(e.target.files??[]); const folderId=mediaFolder==="all"||mediaFolder==="root"?null:mediaFolder; for(const file of files){try{const asset=await uploadMedia.mutateAsync({file,folderId,tags:["campaign"]}); setSelectedMediaIds(ids=>Array.from(new Set([...ids,asset.id])));}catch(error){toast.error(error instanceof Error?error.message:"Upload failed.");}} inputEl.value="";}} />
                </label>
              </div>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <Button type="button" variant={mediaFolder==="all"?"default":"outline"} size="sm" onClick={()=>setMediaFolder("all")}>All media</Button>
          <Button type="button" variant={mediaFolder==="root"?"default":"outline"} size="sm" onClick={()=>setMediaFolder("root")}>Uncategorized</Button>
          {(mediaFolders.data??[]).map(folder=><Button key={folder.id} type="button" variant={mediaFolder===folder.id?"default":"outline"} size="sm" onClick={()=>setMediaFolder(folder.id)}>{folder.name}</Button>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={mediaAssets.isLoading || !(mediaAssets.data ?? []).length}
            onClick={() => {
              setSelectedMediaIds(
                (mediaAssets.data ?? []).map((asset) => asset.id).slice(0, input.maxPosts),
              );
              setMediaSectionOpen(false);
            }}
          >
            <FolderOpen className="h-4 w-4" /> Use this entire folder
          </Button>
          <span className="text-xs text-muted-foreground">
            Up to {input.maxPosts} pieces will be connected to this campaign.
          </span>
        </div>
        <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-xl pr-1">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {(mediaAssets.data??[]).slice(0,36).map(asset=><CampaignMediaTile key={asset.id} asset={asset} selected={selectedMediaIds.includes(asset.id)} onToggle={()=>setSelectedMediaIds(ids=>ids.includes(asset.id)?ids.filter(id=>id!==asset.id):[...ids,asset.id])} />)}
          </div>
        </div>
        {!mediaAssets.isLoading && !(mediaAssets.data??[]).length && <p className="mt-4 text-sm text-muted-foreground">No media in this folder yet. Upload files or choose another folder.</p>}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{selectedMediaIds.length} selected{selectedMediaIds.length===0 ? " · choose at least one piece of content" : ""}</span>{selectedMediaIds.length>0&&<button type="button" className="text-primary" onClick={()=>setSelectedMediaIds([])}>Clear selection</button>}</div>
          </div>
        )}
      </section>

      {showSharedMediaPicker && workspaceId && (
        <MediaPicker
          workspaceId={workspaceId}
          picked={selectedMediaIds}
          onClose={()=>setShowSharedMediaPicker(false)}
          onConfirm={(ids)=>{
            setSelectedMediaIds(ids.slice(0,24));
            setShowSharedMediaPicker(false);
            setMediaSectionOpen(false);
            void mediaAssets.refetch();
          }}
        />
      )}

      {campaignDirection && (
        <details className="rounded-xl border border-primary/25 bg-primary/5 p-4" open>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold">Wave Assist · Campaign Direction</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{campaignDirection.angle}</p>
          </summary>
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audience insight</p><p className="mt-1 text-sm">{campaignDirection.audienceInsight}</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {campaignDirection.pillars.map((pillar) => (
                <div key={pillar.name} className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="font-semibold">{pillar.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pillar.purpose}</p>
                  <ul className="mt-2 space-y-1 text-sm">{pillar.examples.map((example,index)=><li key={index}>• {example}</li>)}</ul>
                </div>
              ))}
            </div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hooks to explore</p><div className="mt-2 flex flex-wrap gap-2">{campaignDirection.hooks.map((hook,index)=><span key={index} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs">{hook}</span>)}</div></div>
            {campaignDirection.mediaRecommendations.length > 0 && <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended content plan</p>
              <div className="mt-2 space-y-3">
                {campaignDirection.mediaRecommendations.map((rec,index)=><div key={rec.mediaId+index} className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{(mediaAssets.data??[]).find(a=>a.id===rec.mediaId)?.name ?? `Selected media ${index+1}`}</p><p className="mt-1 text-xs text-muted-foreground">{rec.reason}</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{rec.suggestedDay}</span></div>
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                    <label className="rounded-lg bg-surface/70 p-2"><span className="text-muted-foreground">What WaveOS thinks this is</span><input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-medium" value={rec.contentType} onChange={(event)=>updateMediaRecommendation(index,{contentType:event.target.value})}/></label>
                    <label className="rounded-lg bg-surface/70 p-2"><span className="text-muted-foreground">Placement</span><select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-medium capitalize" value={rec.placement} onChange={(event)=>updateMediaRecommendation(index,{placement:event.target.value as "feed"|"story"|"both"})}><option value="feed">Feed post</option><option value="story">Story</option><option value="both">Feed + Story</option></select></label>
                    <div className="rounded-lg bg-surface/70 p-2"><span className="text-muted-foreground">Hook potential</span><div className="mt-1 font-medium capitalize">{rec.hookPotential}</div></div>
                  </div>
                  <label className="mt-3 block text-xs"><span className="font-medium">What it shows</span><textarea className="mt-1 min-h-16 w-full rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground" value={rec.visualSummary} onChange={(event)=>updateMediaRecommendation(index,{visualSummary:event.target.value})}/></label>
                  <label className="mt-2 block text-xs"><span className="font-medium">Main message or purpose</span><input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5" value={rec.likelyPurpose} onChange={(event)=>updateMediaRecommendation(index,{likelyPurpose:event.target.value})}/></label>
                  <label className="mt-3 block text-xs"><span className="font-medium">Proposed caption / angle</span><textarea className="mt-1 min-h-24 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={rec.caption} onChange={(event)=>updateMediaRecommendation(index,{caption:event.target.value})}/></label>
                  <div className="mt-2 flex flex-wrap gap-1">{rec.hashtags.map(tag=><span key={tag} className="text-xs text-primary">{tag.startsWith("#")?tag:`#${tag}`}</span>)}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground"><span>{rec.platforms.join(" · ")}</span><span>•</span><span className="capitalize">{rec.confidence} confidence</span><span>•</span><span>{rec.inspectionMode==="video_frames"?"Video visually inspected":rec.inspectionMode==="photo"?"Photo visually inspected":"Metadata only"}</span></div>
                  <Button type="button" size="sm" className="mt-3" variant={confirmedMediaIds.includes(rec.mediaId)?"secondary":"outline"} onClick={()=>setConfirmedMediaIds((current)=>current.includes(rec.mediaId)?current.filter((id)=>id!==rec.mediaId):[...current,rec.mediaId])}>
                    <Check className="h-4 w-4" /> {confirmedMediaIds.includes(rec.mediaId)?"Confirmed · edit again":"Confirm understanding"}
                  </Button>
                </div>)}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{confirmedMediaIds.length} of {campaignDirection.mediaRecommendations.length} assets confirmed. Corrections stay private to this workspace and guide future campaign analysis.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={()=>void createPostDrafts()} disabled={draftsBusy||draftsCreated||confirmedMediaIds.length!==campaignDirection.mediaRecommendations.length}>
                  {draftsBusy?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}
                  {draftsCreated?"Campaign drafts created":"Create feed & story drafts"}
                </Button>
                <Button asChild variant="outline">
                  <a href="/create">Open Create Post</a>
                </Button>
              </div>
            </div>}
          </div>
        </details>
      )}

      <CampaignTranscripts workspaceId={workspaceId} assets={selectedMediaIds.map((id) => assetLookup.get(id)).filter((asset): asset is MediaAsset => Boolean(asset))} />
      {workflowDraft.data?.payload && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold">A private server draft is available</div>
            <div className="text-xs text-muted-foreground">
              Last saved {new Date(workflowDraft.data.updated_at).toLocaleString()}.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                restoreServerDraft();
              }}
            >
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={() => workflowDraft.discard.mutate()}>
              Discard
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,.72fr)]">
        <section id="campaign-builder-workflow" className="scroll-mt-24 space-y-5 sm:surface-card sm:p-6">
          <MobileWorkflowSteps steps={mobileSteps} step={mobileStep} onChange={setMobileStep} />
          <div className="grid gap-4 sm:grid-cols-2">
            <MobileWorkflowSection active={mobileStep === 0}>
            <Field label="Campaign name">
              <input
                className={inputClass}
                value={input.name}
                maxLength={120}
                placeholder="Spring service launch"
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 1}>
            <div className="grid grid-cols-2 gap-3 sm:hidden" aria-label="Campaign goal">
              {CAMPAIGN_GOALS.map((goal) => <Button key={goal} variant="outline" aria-pressed={input.goal === goal} className={cn("min-h-24 whitespace-normal rounded-xl", input.goal === goal && "border-primary bg-primary/10 text-primary")} onClick={() => update("goal", goal)}>{({ awareness: "Brand Awareness", engagement: "Increase Engagement", leads: "Generate Leads", launch: "Promote a Service", retention: "Keep Customers" })[goal]}</Button>)}
            </div>
            <div className="hidden sm:block">
            <Field label="Primary goal">
              <select
                className={inputClass}
                value={input.goal}
                onChange={(event) => update("goal", event.target.value as CampaignGoal)}
              >
                {CAMPAIGN_GOALS.map((goal) => (
                  <option key={goal} value={goal}>
                    {goal[0].toUpperCase() + goal.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            </div>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="Start date">
              <input
                className={inputClass}
                type="date"
                value={input.startDate}
                onChange={(event) => update("startDate", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="End date">
              <input
                className={inputClass}
                type="date"
                value={input.endDate}
                onChange={(event) => update("endDate", event.target.value)}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 3}>
            <Field label="Maximum posts">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={60}
                value={input.maxPosts}
                onChange={(event) => update("maxPosts", Number(event.target.value))}
              />
            </Field>
            </MobileWorkflowSection>
            <MobileWorkflowSection active={mobileStep === 4}>
            <Field label="Planning times" hint="Local workspace times, comma separated">
              <input
                className={inputClass}
                value={input.postingHours.join(", ")}
                placeholder="09:00, 15:00"
                onChange={(event) =>
                  update(
                    "postingHours",
                    event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>
            </MobileWorkflowSection>
          </div>

          <MobileWorkflowSection active={mobileStep === 2}>
          <ChoiceGroup
            label="Platforms"
            values={PLATFORM_OPTIONS}
            selected={input.platforms}
            onToggle={(value) => toggleList("platforms", value)}
          />
          <div className="mt-4">
            <ChoiceGroup
              label="Campaign content"
              values={["feed", "story"]}
              selected={input.contentFormats}
              onToggle={(value) => toggleList("contentFormats", value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Use both to balance lasting feed content with timely, conversational Stories.
            </p>
          </div>
          </MobileWorkflowSection>
          <MobileWorkflowSection active={mobileStep === 4}>
          <ChoiceGroup
            label="Days to exclude"
            values={DAY_OPTIONS}
            selected={input.excludedDays}
            onToggle={(value) => toggleList("excludedDays", value)}
          />
          </MobileWorkflowSection>

          <MobileWorkflowSection active={mobileStep === 5}>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 text-sm sm:hidden">
            <dt className="text-muted-foreground">Campaign</dt><dd className="break-words">{input.name || "Not named"}</dd>
            <dt className="text-muted-foreground">Goal</dt><dd className="capitalize">{input.goal}</dd>
            <dt className="text-muted-foreground">Platforms</dt><dd className="break-words capitalize">{input.platforms.join(", ") || "None"}</dd>
            <dt className="text-muted-foreground">Formats</dt><dd className="break-words capitalize">{input.contentFormats.join(", ") || "None"}</dd>
            <dt className="text-muted-foreground">Maximum posts</dt><dd>{input.maxPosts}</dd>
            <dt className="text-muted-foreground">Dates</dt><dd>{input.startDate} – {input.endDate}</dd>
          </dl>
          <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border bg-background/40 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Approval required</span>
              <span className="block text-xs text-muted-foreground">
                Mark every draft item as requiring review before any future scheduling step.
              </span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={input.approvalRequired}
              onChange={(event) => update("approvalRequired", event.target.checked)}
            />
          </label>
          <fieldset className="mt-3 rounded-xl border border-border bg-background/40 p-4">
            <legend className="px-1 text-sm font-semibold">Campaign optimization</legend>
            <p className="mt-1 text-xs text-muted-foreground">Only upcoming, unpublished items can ever be changed. Published posts are never altered.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button type="button" variant={input.optimizationMode==="approval_required"?"secondary":"outline"} className="h-auto min-h-14 whitespace-normal" onClick={()=>update("optimizationMode","approval_required")}>Approval Required</Button>
              <Button type="button" variant={input.optimizationMode==="automatic"?"secondary":"outline"} className="h-auto min-h-14 whitespace-normal" onClick={()=>update("optimizationMode","automatic")}>Automatic Optimization</Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{input.optimizationMode==="automatic"?"WaveOS may optimize future unpublished items and will notify you.":"WaveOS recommends changes and waits for your approval."}</p>
          </fieldset>
          </MobileWorkflowSection>

          {errors.length > 0 && (
            <ul className={cn("rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning", mobileStep !== 5 && "hidden sm:block")}>
              {errors.map((error) => (
                <li key={error}>• {error}</li>
              ))}
            </ul>
          )}
          <MobileWorkflowFooter step={mobileStep} total={mobileSteps.length} onChange={setMobileStep} canNext={mobileStep === 0 ? Boolean(input.name.trim()) : mobileStep === 2 ? input.platforms.length > 0 && input.contentFormats.length > 0 : mobileStep === 3 ? input.maxPosts > 0 && input.maxPosts <= 60 : true} final={<Button className="min-h-12" onClick={generatePlan} disabled={errors.length > 0}><Sparkles /> Build plan</Button>} />
        </section>

        <aside className="space-y-5">
          <section className="surface-card hidden p-5 sm:block">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Guardrails
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• Nothing here schedules or publishes automatically.</li>
              <li>• Times are user-selected planning windows, not performance claims.</li>
              <li>• Approval status is preserved on every generated item.</li>
              <li>• AI suggestions are creative direction only; they never schedule or publish.</li>
            </ul>
          </section>

          <section className="surface-card p-5">
            <div className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-primary" /> What Campaign Manager does
            </div>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Choose the campaign goal, platforms, cadence, and content.</li>
              <li>2. Analyze the selected media and build creative direction.</li>
              <li>3. Turn the plan into linked post drafts with captions and media.</li>
              <li>4. Review, approve, schedule, and follow the campaign from the command center.</li>
            </ol>
          </section>
        </aside>
      </div>

      {preview.length > 0 && (
        <section className="surface-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="font-semibold">Draft plan · {preview.length} items</h2>
              <p className="text-xs text-muted-foreground">
                Review every working title before saving.
              </p>
            </div>
            <Button onClick={() => savePlan.mutate()} disabled={savePlan.isPending || selectedMediaIds.length === 0}>
              {savePlan.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Save for review
            </Button>
          </div>
          <div className="divide-y divide-border">
            {preview.map((item) => (
              <article
                key={`${item.plannedDate}-${item.localTime}-${item.sequence}`}
                className="grid gap-3 p-4 sm:grid-cols-[6rem_8rem_minmax(0,1fr)] sm:p-5"
              >
                <div className="text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> {item.plannedDate}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" /> {item.localTime}
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase text-primary">{item.platform}</span>
                    <span className="rounded-full border border-border bg-elevated px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{item.contentFormat}</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold">{item.workingTitle}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.copyBrief}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function ChoiceGroup({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <Button variant="outline"
              key={value}
              type="button"
              onClick={() => onToggle(value)}
              className={cn(
                "min-h-10 rounded-full border px-3 text-xs font-semibold capitalize",
                active
                  ? "border-primary/50 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-elevated",
              )}
            >
              {active && <Check className="mr-1 inline h-3.5 w-3.5" />}
              {value}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";


function CampaignMediaTile({asset,selected,onToggle}:{asset:MediaAsset;selected:boolean;onToggle:()=>void}) {
  const [url,setUrl]=useState<string|null>(null);
  useEffect(()=>{let cancelled=false; void getMediaPreviewUrl(asset,3600,"thumbnail").then(value=>{if(!cancelled)setUrl(value);}).catch(()=>{if(!cancelled)setUrl(null);}); return ()=>{cancelled=true;};},[asset]);
  const isVideo=asset.mime_type.startsWith("video/");
  return <button type="button" onClick={onToggle} className={cn("relative aspect-square overflow-hidden rounded-xl border bg-elevated",selected?"border-primary ring-2 ring-primary/30":"border-border")}>
    {url ? (isVideo ? <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" /> : <img src={url} alt={asset.name} className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center text-muted-foreground">{isVideo?<Video className="h-5 w-5"/>:<Images className="h-5 w-5"/>}</div>}
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-left text-[10px] text-white"><span className="line-clamp-1">{asset.name}</span></div>
    {selected&&<span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground"><CheckCircle2 className="h-4 w-4"/></span>}
  </button>;
}

