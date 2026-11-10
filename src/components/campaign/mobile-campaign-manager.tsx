import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Check,
  Clock3,
  Info,
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
  ListChecks,
  AudioLines,
  X,
} from "lucide-react";
import { MediaPicker } from "@/routes/_authenticated/create";
import { UnsavedChangesGuard } from "@/components/app/unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { MobileWorkflowSection, MobileWorkflowFooter } from "@/components/app/mobile-workflow";
import { AiProcessingIndicator, SurferWaveSpinner } from "@/components/app/ai-processing-indicator";
import { CAMPAIGN_GOALS } from "@/lib/phase-one-planning";
import { CAMPAIGN_BUILDER_STEPS, campaignGoalReady } from "@/lib/campaign-builder-steps";
import { cn } from "@/lib/utils";
import { getMediaPreviewUrl, type MediaAsset } from "@/hooks/use-media";
import { TranscriptPanel, transcriptStatusLabel } from "@/components/media/transcript-panel";
import {
  isTranscriptStale,
  transcribableMedia,
  useMediaTranscripts,
  useSaveTranscriptEdits,
  useTranscriptRunner,
} from "@/hooks/use-media-transcripts";
import {
  DAY_OPTIONS,
  GOAL_LABELS,
  MAX_SAMPLED_VIDEOS,
  PLATFORM_OPTIONS,
  type CampaignManagerController,
} from "@/components/campaign/use-campaign-manager";

/** Phone layout: five-step builder (Goal → Media → Analyze → Plan → Launch). */
export function MobileCampaignManager({ controller }: { controller: CampaignManagerController }) {
  const {
    input,
    setInput,
    preview,
    setPreview,
    dirty,
    setDirty,
    autoSaveState,
    setAutoSaveState,
    mobileStep,
    setMobileStep,
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

  const transcribableAssets = selectedMediaIds
    .map((id) => assetLookup.get(id))
    .filter((asset): asset is MediaAsset => Boolean(asset && transcribableMedia(asset)));
  const transcripts = useMediaTranscripts(workspaceId, transcribableAssets.map((asset) => asset.id));
  const transcriptRunner = useTranscriptRunner(workspaceId);
  const saveTranscriptEdits = useSaveTranscriptEdits(workspaceId);
  const [transcriptBatch, setTranscriptBatch] = useState<{ done: number; total: number } | null>(null);
  const [openTranscriptId, setOpenTranscriptId] = useState<string | null>(null);
  const transcriptDone = transcribableAssets.filter((asset) => {
    const status = transcripts.data?.[asset.id]?.status;
    return status === "completed" || status === "no_speech";
  }).length;
  const transcriptPending = transcribableAssets.filter((asset) => {
    const row = transcripts.data?.[asset.id];
    if (row?.status === "completed" || row?.status === "no_speech") return false;
    if (row?.status === "processing" && !isTranscriptStale(row)) return false;
    return !transcriptRunner.isRunning(asset.id);
  });

  async function transcribeAllSelected() {
    if (transcriptBatch || !transcriptPending.length) return;
    const queue = [...transcriptPending];
    setTranscriptBatch({ done: 0, total: queue.length });
    for (const asset of queue) {
      await transcriptRunner.start(asset);
      setTranscriptBatch((current) => (current ? { ...current, done: current.done + 1 } : current));
    }
    setTranscriptBatch(null);
  }

  if (!activeWorkspace) return null;

  const saveButton = (
    <Button
      className="min-h-12"
      onClick={() => savePlan.mutate()}
      disabled={savePlan.isPending || errors.length > 0 || Boolean(launchBlocker)}
    >
      {savePlan.isPending ? <Loader2 className="animate-spin" /> : <Check />}
      Save for review
    </Button>
  );

  return (
    <div className="ocean-page space-y-5">
      <UnsavedChangesGuard dirty={dirty} subject="this campaign plan" />
      <header className="wave-panel p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="ocean-eyebrow flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> Campaign Manager
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">Build a campaign from your content</h1>
            <p className="mt-2 hidden max-w-2xl text-sm text-muted-foreground sm:block">
              Pick a goal and your photos or videos. WaveOS reads what it can about each piece, drafts a
              plan with captions, and saves everything for review — nothing is scheduled or published here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground" role="status">{autoSaveState==="saving"?"Saving draft…":autoSaveState==="saved"?"Draft saved":autoSaveState==="error"?"Auto-save paused":""}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveServerDraft()}
              disabled={workflowDraft.save.isPending}
            >
              {workflowDraft.save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              Save draft
            </Button>
            <Button variant="outline" size="sm" onClick={startNewCampaign}>
              <Megaphone /> New campaign
            </Button>
            {(campaigns.data ?? []).length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <a href="#your-campaigns">Your campaigns ({campaigns.data?.length})</a>
              </Button>
            )}
          </div>
        </div>
      </header>

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

      <section id="campaign-builder-workflow" className="scroll-mt-24 space-y-4">
        <CampaignStepper active={mobileStep} completion={stepCompletion} onSelect={goToStep} />

        {continuedFrom && (
          <p className="rounded-xl border border-border bg-surface/50 p-3 text-xs text-muted-foreground">
            Continuing from “{continuedFrom}”. Saving creates a new campaign with these settings; the
            original campaign and its posts stay unchanged.
          </p>
        )}

        {/* Step 1 · Goal */}
        <MobileWorkflowSection active={mobileStep === 0}>
          <StepCard index={0} title="Goal" detail="Name the campaign, pick what it should achieve and where it runs." done={stepCompletion[0]}>
            <Field label="Campaign name">
              <input
                className={inputClass}
                value={input.name}
                maxLength={120}
                placeholder="Spring service launch"
                onChange={(event) => update("name", event.target.value)}
              />
            </Field>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Primary goal</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Campaign goal">
                {CAMPAIGN_GOALS.map((goal) => (
                  <Button
                    key={goal}
                    type="button"
                    variant="outline"
                    aria-pressed={input.goal === goal}
                    className={cn(
                      "h-auto min-h-16 whitespace-normal rounded-xl text-sm",
                      input.goal === goal && "border-neon-cyan/60 bg-neon-cyan/10 text-foreground neon-glow",
                    )}
                    onClick={() => update("goal", goal)}
                  >
                    {GOAL_LABELS[goal]}
                  </Button>
                ))}
              </div>
            </fieldset>
            <div className="mt-4">
              <ChoiceGroup
                label="Platforms"
                values={PLATFORM_OPTIONS}
                selected={input.platforms}
                onToggle={(value) => toggleList("platforms", value)}
              />
            </div>
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
          </StepCard>
        </MobileWorkflowSection>

        {/* Step 2 · Media */}
        <MobileWorkflowSection active={mobileStep === 1}>
          <StepCard index={1} title="Media" detail="Choose the photos and videos this campaign is built from." done={stepCompletion[1]}>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={()=>setShowSharedMediaPicker(true)}>
                <Images className="h-4 w-4" /> Drive / Dropbox / Frame.io
              </Button>
              <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
                {uploadMedia.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload from device
                <input ref={mediaInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.mp4,.mov,image/jpeg,image/png,video/mp4,video/quicktime" className="hidden" onChange={(event) => void uploadCampaignFiles(event)} />
              </label>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {selectedMediaIds.length} selected
                  {selectedMediaIds.length === 0 ? " · choose at least one piece of content" : ` · up to ${input.maxPosts} become posts`}
                </span>
                {selectedMediaIds.length > 0 && (
                  <button type="button" className="text-primary" onClick={() => changeSelectedMedia([])}>Clear selection</button>
                )}
              </div>
              {selectedMediaIds.length > 0 && (
                <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
                  {selectedMediaIds.map((id, index) => {
                    const asset = assetLookup.get(id);
                    return (
                      <div key={id} className="relative w-16 shrink-0">
                        <MediaThumb asset={asset ?? null} className="aspect-square w-16 rounded-lg" />
                        <span className="absolute left-1 top-1 rounded-md bg-background/80 px-1 text-[10px] font-bold">{index + 1}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${asset?.name ?? "media"}`}
                          onClick={() => changeSelectedMedia((ids) => ids.filter((item) => item !== id))}
                          className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/80"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-border bg-background/30 p-3">
              <button
                type="button"
                onClick={() => setMediaSectionOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={mediaSectionOpen}
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-neon-cyan" /> Campaign content library</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Browse WaveOS folders, or use a whole folder at once.</p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/50">
                  {mediaSectionOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>
              {mediaSectionOpen && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
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
                        changeSelectedMedia(
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
                  <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-xl pr-1">
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                      {(mediaAssets.data??[]).slice(0,48).map(asset=><CampaignMediaTile key={asset.id} asset={asset} selected={selectedMediaIds.includes(asset.id)} onToggle={()=>changeSelectedMedia(ids=>ids.includes(asset.id)?ids.filter(id=>id!==asset.id):[...ids,asset.id])} />)}
                    </div>
                  </div>
                  {mediaAssets.isLoading && <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading media…</p>}
                  {!mediaAssets.isLoading && !(mediaAssets.data??[]).length && <p className="mt-3 text-sm text-muted-foreground">No media in this folder yet. Upload files or choose another folder.</p>}
                </div>
              )}
            </div>
          </StepCard>
        </MobileWorkflowSection>

        {/* Step 3 · Analyze */}
        <MobileWorkflowSection active={mobileStep === 2}>
          <StepCard index={2} title="Analyze" detail="Optional. WaveOS reviews each piece so the plan and captions fit what's actually in it." done={stepCompletion[2]}>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-cyan" /> File names, tags, type, length and size</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-cyan" /> Photo previews and up to 3 frames from each of the first {MAX_SAMPLED_VIDEOS} videos</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-cyan" /> Your earlier corrections in this workspace</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon-cyan" /> Finished transcripts of what's said in each video (your corrections first)</li>
            </ul>

            {transcribableAssets.length > 0 && (
              <div className="mt-4 rounded-xl border border-border bg-background/30 p-3">
                <div className="flex items-center gap-2">
                  <AudioLines className="h-4 w-4 text-neon-cyan" />
                  <p className="text-sm font-semibold">Transcripts</p>
                  <span className="ml-auto text-xs text-muted-foreground">{transcriptDone} of {transcribableAssets.length} done</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Optional. Speech-to-text reads what's said so analysis can quote real words instead of guessing.
                </p>
                {transcriptBatch ? (
                  <p className="mt-2 flex items-center gap-2 text-xs" role="status">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-neon-cyan" /> Transcribing {Math.min(transcriptBatch.done + 1, transcriptBatch.total)} of {transcriptBatch.total}…
                  </p>
                ) : transcriptPending.length > 0 ? (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => void transcribeAllSelected()}>
                    <AudioLines /> Transcribe {transcriptPending.length === 1 ? "1 video" : `${transcriptPending.length} videos`}
                  </Button>
                ) : null}
                <ul className="mt-3 space-y-2">
                  {transcribableAssets.map((asset) => {
                    const row = transcripts.data?.[asset.id];
                    const run = transcriptRunner.runs[asset.id];
                    const open = openTranscriptId === asset.id;
                    return (
                      <li key={asset.id} className="rounded-xl border border-border bg-background/40">
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 p-2 text-left"
                          aria-expanded={open}
                          onClick={() => setOpenTranscriptId(open ? null : asset.id)}
                        >
                          <MediaThumb asset={asset} className="h-10 w-10 shrink-0 rounded-lg" />
                          <span className="min-w-0 flex-1 truncate text-sm">{asset.name}</span>
                          <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">{transcriptStatusLabel(row, run)}</span>
                          {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                        </button>
                        {open && (
                          <TranscriptPanel
                            className="m-2 mt-0"
                            transcript={row}
                            run={run}
                            canStart={!transcriptBatch && !transcriptRunner.isRunning(asset.id)}
                            onStart={() => void transcriptRunner.start(asset)}
                            onSave={(input) => saveTranscriptEdits({ mediaAssetId: asset.id, ...input })}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <Button
              className="mt-4 min-h-12 w-full sm:w-auto"
              onClick={() => void generateDirection()}
              disabled={!input.platforms.length || directionBusy || selectedMediaIds.length===0}
            >
              {directionBusy ? <SurferWaveSpinner className="size-5" /> : <Sparkles />}
              {campaignDirection ? "Analyze again" : "Analyze & Build Campaign"}
            </Button>
            {selectedMediaIds.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Choose media in the Media step first.</p>
            )}

            {analysisProgress && (
              <div className="mt-4 space-y-2 rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 p-3" role="status" aria-live="polite">
                <AiProcessingIndicator
                  className="w-full border-0 bg-transparent px-0 py-1"
                  label="WaveOS is reading your campaign content"
                  detail="The surfer stays in motion while the AI builds recommendations."
                />
                {analysisProgress.framesTotal > 0 && (
                  <ProgressRow
                    label="Sampling video frames"
                    detail={`${analysisProgress.framesDone} of ${analysisProgress.framesTotal} video${analysisProgress.framesTotal === 1 ? "" : "s"}`}
                    state={analysisProgress.phase === "frames" ? "running" : "done"}
                    value={analysisProgress.framesDone / analysisProgress.framesTotal}
                  />
                )}
                <ProgressRow
                  label={`Wave Assist reviewing ${analysisProgress.assetCount} asset${analysisProgress.assetCount === 1 ? "" : "s"}`}
                  detail={analysisProgress.phase === "ai" ? "Waiting for the response…" : "Starts after frames are read"}
                  state={analysisProgress.phase === "ai" ? "running" : "waiting"}
                />
              </div>
            )}

            {campaignDirection && campaignDirection.mediaRecommendations.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold">What WaveOS understood</p>
                {campaignDirection.mediaRecommendations.map((rec, index) => {
                  const asset = assetLookup.get(rec.mediaId);
                  const confirmed = confirmedMediaIds.includes(rec.mediaId);
                  return (
                    <article key={rec.mediaId + index} className={cn("rounded-xl border bg-background/50 p-3", confirmed ? "border-success/40" : "border-border")}>
                      <div className="flex items-start gap-3">
                        <MediaThumb asset={asset ?? null} className="h-16 w-16 shrink-0 rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{asset?.name ?? `Selected media ${index+1}`}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                            <span className={cn("rounded-full px-2 py-0.5", rec.inspectionMode === "metadata_only" ? "bg-warning/15 text-warning" : "bg-neon-cyan/15 text-neon-cyan")}>
                              {rec.inspectionMode==="video_frames"?"Video visually inspected":rec.inspectionMode==="photo"?"Photo visually inspected":"Metadata only"}
                            </span>
                            <span className="rounded-full bg-surface px-2 py-0.5 text-muted-foreground">{rec.confidence} confidence</span>
                            <span className="rounded-full bg-surface px-2 py-0.5 text-muted-foreground">Hook {rec.hookPotential}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <label className="block"><span className="text-muted-foreground">What WaveOS thinks this is</span><input className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-2 py-1.5 font-medium" value={rec.contentType} onChange={(event)=>updateMediaRecommendation(index,{contentType:event.target.value})}/></label>
                        <label className="block"><span className="text-muted-foreground">Main message or purpose</span><input className="mt-1 min-h-10 w-full rounded-md border border-border bg-background px-2 py-1.5" value={rec.likelyPurpose} onChange={(event)=>updateMediaRecommendation(index,{likelyPurpose:event.target.value})}/></label>
                      </div>
                      <label className="mt-2 block text-xs"><span className="text-muted-foreground">What it shows</span><textarea className="mt-1 min-h-16 w-full rounded-md border border-border bg-background px-2 py-1.5" value={rec.visualSummary} onChange={(event)=>updateMediaRecommendation(index,{visualSummary:event.target.value})}/></label>
                      <p className="mt-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Speech evidence:</span>{" "}
                        {rec.transcriptEvidence === "user_corrected_transcript"
                          ? "your corrected transcript was used"
                          : rec.transcriptEvidence === "speech_to_text_transcript"
                            ? "the speech-to-text transcript was used"
                            : asset?.mime_type.startsWith("video/")
                              ? "no transcript — spoken words were not analyzed"
                              : "none (photo)"}
                      </p>
                      <Button type="button" size="sm" className="mt-3" variant={confirmed?"secondary":"outline"} onClick={()=>setConfirmedMediaIds((current)=>current.includes(rec.mediaId)?current.filter((id)=>id!==rec.mediaId):[...current,rec.mediaId])}>
                        <Check className="h-4 w-4" /> {confirmed?"Confirmed · edit again":"Confirm understanding"}
                      </Button>
                    </article>
                  );
                })}
                <p className="text-xs text-muted-foreground">{builderState.confirmedCount} of {campaignDirection.mediaRecommendations.length} assets confirmed. Corrections stay private to this workspace and guide future campaign analysis.</p>
              </div>
            )}
            {campaignDirection && campaignDirection.mediaRecommendations.length === 0 && (
              <p className="mt-4 text-sm text-muted-foreground">Wave Assist returned campaign direction but no per-asset recommendations. You can still plan and save.</p>
            )}
          </StepCard>
        </MobileWorkflowSection>

        {/* Step 4 · Plan */}
        <MobileWorkflowSection active={mobileStep === 3}>
          <StepCard index={3} title="Plan" detail="Arrange the post order, edit captions, and set when the campaign runs." done={stepCompletion[3]}>
            {campaignDirection && (
              <div className="rounded-xl border border-neon-violet/30 bg-neon-violet/5 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neon-violet">
                  <Sparkles className="h-3.5 w-3.5" /> Wave Assist · Campaign Direction
                </p>
                <p className="mt-1 text-sm font-medium">{campaignDirection.angle}</p>
                <p className="mt-1 text-xs text-muted-foreground">{campaignDirection.audienceInsight}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {campaignDirection.pillars.map((pillar) => (
                    <span key={pillar.name} title={pillar.purpose} className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs">{pillar.name}</span>
                  ))}
                </div>
                {campaignDirection.hooks.length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-medium">Hooks to explore ({campaignDirection.hooks.length})</summary>
                    <ul className="mt-2 space-y-1 text-muted-foreground">{campaignDirection.hooks.map((hook, index) => <li key={index}>• {hook}</li>)}</ul>
                  </details>
                )}
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Post sequence</p>
                <span className="text-xs text-muted-foreground">{sequenceMediaIds.length} post{sequenceMediaIds.length === 1 ? "" : "s"}</span>
              </div>
              {sequenceMediaIds.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Choose media in the Media step to build a sequence.</p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {(campaignDirection
                    ? campaignDirection.mediaRecommendations.map((rec) => rec.mediaId)
                    : sequenceMediaIds
                  ).map((mediaId, index, list) => {
                    const asset = assetLookup.get(mediaId);
                    const rec = campaignDirection?.mediaRecommendations[index];
                    const slot = preview[index];
                    return (
                      <li key={mediaId + index} className="rounded-xl border border-border bg-background/40 p-3">
                        <div className="flex items-start gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg neon-fill text-xs font-bold text-primary-foreground">{index + 1}</span>
                          <MediaThumb asset={asset ?? null} className="h-14 w-14 shrink-0 rounded-lg" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{asset?.name ?? "Selected media"}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {slot ? `${slot.plannedDate} · ${slot.localTime} · ${slot.platform} ${slot.contentFormat}` : rec ? `Suggested: ${rec.suggestedDay}` : "Dates assigned when you build the schedule"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Move earlier" disabled={index === 0} onClick={() => moveSequenceItem(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Move later" disabled={index === list.length - 1} onClick={() => moveSequenceItem(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                          </div>
                        </div>
                        {rec && (
                          <>
                            <label className="mt-3 block text-xs"><span className="font-medium">Proposed caption / angle</span><textarea className="mt-1 min-h-24 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" value={rec.caption} onChange={(event)=>updateMediaRecommendation(index,{caption:event.target.value})}/></label>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select aria-label="Placement" className="min-h-9 rounded-md border border-border bg-background px-2 text-xs" value={rec.placement} onChange={(event)=>updateMediaRecommendation(index,{placement:event.target.value as "feed"|"story"|"both"})}>
                                <option value="feed">Feed post</option><option value="story">Story</option><option value="both">Feed + Story</option>
                              </select>
                              {rec.hashtags.map(tag=><span key={tag} className="text-xs text-primary">{tag.startsWith("#")?tag:`#${tag}`}</span>)}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              {!campaignDirection && sequenceMediaIds.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  No captions yet. Run Analyze for draft captions, or generate them after saving.
                </p>
              )}
              {campaignDirection && selectedMediaIds.length > campaignDirection.mediaRecommendations.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {selectedMediaIds.length - campaignDirection.mediaRecommendations.length} selected piece(s) weren't covered by the analysis and will be added at the end without captions.
                </p>
              )}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <input className={inputClass} type="date" value={input.startDate} onChange={(event) => update("startDate", event.target.value)} />
              </Field>
              <Field label="End date">
                <input className={inputClass} type="date" value={input.endDate} onChange={(event) => update("endDate", event.target.value)} />
              </Field>
              <Field label="Maximum posts">
                <input className={inputClass} type="number" min={1} max={60} value={input.maxPosts} onChange={(event) => update("maxPosts", Number(event.target.value))} />
              </Field>
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
            </div>
            <div className="mt-4">
              <ChoiceGroup
                label="Days to exclude"
                values={DAY_OPTIONS}
                selected={input.excludedDays}
                onToggle={(value) => toggleList("excludedDays", value)}
              />
            </div>
            <Button className="mt-4 min-h-11" variant="secondary" onClick={generatePlan} disabled={errors.length > 0}>
              <CalendarDays /> Build plan
            </Button>

            {preview.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <div className="border-b border-border bg-surface/50 px-3 py-2">
                  <p className="text-sm font-semibold">Draft plan · {preview.length} items</p>
                  <p className="text-xs text-muted-foreground">Planning windows only — nothing is scheduled. Review every working title before saving.</p>
                </div>
                <ol className="divide-y divide-border">
                  {preview.map((item, index) => {
                    const assetId = sequenceMediaIds[index];
                    const asset = assetId ? assetLookup.get(assetId) : undefined;
                    return (
                      <li key={`${item.plannedDate}-${item.localTime}-${item.sequence}`} className="flex gap-3 p-3">
                        <div className="w-16 shrink-0 text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {item.plannedDate.slice(5)}</div>
                          <div className="mt-1 flex items-center gap-1"><Clock3 className="h-3 w-3" /> {item.localTime}</div>
                        </div>
                        {asset ? <MediaThumb asset={asset} className="h-12 w-12 shrink-0 rounded-lg" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">No media</span>}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-1">
                            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">{item.platform}</span>
                            <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{item.contentFormat}</span>
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold">{item.workingTitle}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{item.copyBrief}</p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </StepCard>
        </MobileWorkflowSection>

        {/* Step 5 · Launch */}
        <MobileWorkflowSection active={mobileStep === 4}>
          <StepCard index={4} title="Launch" detail="Save for review. Posts are approved one by one before anything is scheduled." done={stepCompletion[4]}>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-xl border border-border bg-surface/50 p-4 text-sm">
              <dt className="text-muted-foreground">Campaign</dt><dd className="break-words">{input.name || "Not named"}</dd>
              <dt className="text-muted-foreground">Goal</dt><dd>{GOAL_LABELS[input.goal]}</dd>
              <dt className="text-muted-foreground">Platforms</dt><dd className="break-words capitalize">{input.platforms.join(", ") || "None"}</dd>
              <dt className="text-muted-foreground">Formats</dt><dd className="break-words capitalize">{input.contentFormats.join(", ") || "None"}</dd>
              <dt className="text-muted-foreground">Posts</dt><dd>{Math.min(sequenceMediaIds.length, input.maxPosts)} of {input.maxPosts} max</dd>
              <dt className="text-muted-foreground">Captions</dt><dd>{campaignDirection ? `${campaignDirection.mediaRecommendations.filter((rec) => rec.caption.trim()).length} drafted for review` : "Generate after saving"}</dd>
              <dt className="text-muted-foreground">Dates</dt><dd>{input.startDate} – {input.endDate}</dd>
            </dl>

            <ol className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                ["Save for review", "Creates draft posts linked to this campaign."],
                ["Approve each post", "Review captions and media in the campaign workspace or Approvals."],
                ["Schedule approved posts", "Only approved posts are scheduled, from Create Post or Calendar."],
              ].map(([title, detail], index) => (
                <li key={title} className="rounded-xl border border-border bg-background/40 p-3">
                  <p className="text-xs font-semibold text-neon-cyan">Step {index + 1}</p>
                  <p className="mt-0.5 text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                </li>
              ))}
            </ol>

            <label className="mt-4 flex min-h-12 items-center justify-between gap-4 rounded-xl border border-border bg-background/40 px-4 py-3">
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

            <div className="mt-3 rounded-xl border border-border bg-background/40 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-neon-cyan" /> Guardrails
              </div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>• Nothing here schedules or publishes automatically.</li>
                <li>• Times are user-selected planning windows, not performance claims.</li>
                <li>• Approval status is preserved on every generated item.</li>
                <li>• AI suggestions are creative direction only; they never schedule or publish.</li>
              </ul>
            </div>

            {(errors.length > 0 || launchBlocker) && (
              <ul className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                {launchBlocker && <li>• {launchBlocker}</li>}
                {errors.filter((error) => error !== launchBlocker).map((error) => (
                  <li key={error}>• {error}</li>
                ))}
              </ul>
            )}

            {savedNotice && (
              <div className="mt-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
                <p className="font-semibold">“{savedNotice.name}” is saved for review.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {savedNotice.contentLinked
                    ? "Its draft posts are in the campaign workspace below. Approve them before scheduling."
                    : "The campaign is saved, but its posts could not be linked. Reopen it below and reconnect the media."}
                </p>
                <Button asChild size="sm" variant="outline" className="mt-2"><a href="#your-campaigns">Open campaign <ArrowRight /></a></Button>
              </div>
            )}

            <div className="mt-4 hidden sm:block">{saveButton}</div>
          </StepCard>
        </MobileWorkflowSection>

        <MobileWorkflowFooter
          step={mobileStep}
          total={CAMPAIGN_BUILDER_STEPS.length}
          onChange={setMobileStep}
          canNext={mobileStep === 0 ? campaignGoalReady(builderState) : mobileStep === 1 ? selectedMediaIds.length > 0 : true}
          final={saveButton}
        />
      </section>

      {showSharedMediaPicker && workspaceId && (
        <MediaPicker
          workspaceId={workspaceId}
          picked={selectedMediaIds}
          onClose={()=>setShowSharedMediaPicker(false)}
          onConfirm={(ids)=>{
            changeSelectedMedia(ids.slice(0,24));
            setShowSharedMediaPicker(false);
            void mediaAssets.refetch();
            void allMediaAssets.refetch();
          }}
        />
      )}

      <section id="your-campaigns" className="wave-panel scroll-mt-24 p-4 sm:p-5">
        <div>
          <div className="ocean-eyebrow flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Campaign command center
          </div>
          <h2 className="mt-1 text-xl font-semibold">Your campaigns</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Reopen a campaign, see its linked posts, and move each piece from draft to review,
            approval, scheduling, and published content.
          </p>
        </div>

        {(campaigns.data ?? []).length > 0 ? (
          <>
            <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
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
                        ? "border-neon-cyan/50 bg-neon-cyan/10"
                        : "border-border bg-background/35 hover:border-neon-cyan/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{campaign.name}</span>
                      <span className="rounded-full bg-background/60 px-2 py-1 text-[9px] uppercase text-muted-foreground">
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
                      {bulkCaptionBusy ? <SurferWaveSpinner className="size-5" /> : <Sparkles />}
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
                    <div key={String(label)} className="rounded-xl border border-border bg-background/40 p-2 text-center">
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
                      const asset = item.media_asset_ids?.[0] ? assetLookup.get(item.media_asset_ids[0]) : undefined;
                      return (
                        <article key={item.id} className="rounded-2xl border border-border bg-surface/50 p-3">
                          <div className="flex items-start gap-3">
                            {asset ? (
                              <MediaThumb asset={asset} className="h-11 w-11 shrink-0 rounded-lg" />
                            ) : (
                              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                                {index + 1}
                              </span>
                            )}
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
                              {captionBusyId === item.id ? <SurferWaveSpinner className="size-5" /> : <Sparkles />}
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
                    This campaign does not have linked content yet. Use Continue building to attach
                    media and save it with linked drafts.
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
          <div className="mt-4 rounded-xl border border-warning/25 bg-warning/5 p-5 text-sm text-warning">
            WaveOS could not load your saved campaigns. Your campaigns were not deleted. Refresh this
            page or try again in a moment.
          </div>
        ) : campaigns.isPending ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns…</p>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            No saved campaigns were returned for this workspace. Build a campaign above, or refresh if
            you expected an existing campaign to appear.
          </div>
        )}
      </section>
    </div>
  );
}

function CampaignStepper({
  active,
  completion,
  onSelect,
}: {
  active: number;
  completion: boolean[];
  onSelect: (index: number) => void;
}) {
  const progress = completion.filter(Boolean).length / CAMPAIGN_BUILDER_STEPS.length;
  return (
    <nav aria-label="Campaign steps" className="wave-panel p-3 sm:p-4">
      <ol className="grid grid-cols-5 gap-1">
        {CAMPAIGN_BUILDER_STEPS.map((label, index) => {
          const done = completion[index];
          const current = active === index;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={current ? "step" : undefined}
                aria-label={`${index + 1}. ${label}${done ? " (done)" : ""}`}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl py-1"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold",
                    current
                      ? "border-transparent neon-fill text-primary-foreground neon-glow"
                      : done
                        ? "border-neon-cyan/50 bg-neon-cyan/10 text-neon-cyan"
                        : "border-border text-muted-foreground",
                  )}
                >
                  {done && !current ? <Check className="h-4 w-4" /> : index + 1}
                </span>
                <span className={cn("text-[11px] font-semibold", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full neon-fill transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </nav>
  );
}

function StepCard({
  index,
  title,
  detail,
  done,
  children,
}: {
  index: number;
  title: string;
  detail: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={`campaign-step-${index}`} className="wave-panel scroll-mt-24 p-4 sm:p-5" aria-labelledby={`campaign-step-${index}-title`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neon-cyan">Step {index + 1} of {CAMPAIGN_BUILDER_STEPS.length}</p>
          <h2 id={`campaign-step-${index}-title`} className="mt-0.5 text-lg font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </div>
        {done && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Step complete" />}
      </div>
      {children}
    </section>
  );
}

function ProgressRow({
  label,
  detail,
  state,
  value,
}: {
  label: string;
  detail: string;
  state: "waiting" | "running" | "done";
  value?: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm">
        {state === "running" ? (
          <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />
        ) : state === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <span className="h-4 w-4 rounded-full border border-border" />
        )}
        <span className="font-medium">{label}</span>
        <span className="ml-auto text-xs text-muted-foreground">{detail}</span>
      </div>
      {value !== undefined && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full neon-fill transition-all" style={{ width: `${Math.round(value * 100)}%` }} />
        </div>
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
                  ? "border-neon-cyan/50 bg-neon-cyan/10 text-foreground"
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

function useMediaThumbUrl(asset: MediaAsset | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!asset) return;
    void getMediaPreviewUrl(asset, 3600, "thumbnail")
      .then((value) => { if (!cancelled) setUrl(value); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [asset]);
  return url;
}

function MediaThumb({ asset, className }: { asset: MediaAsset | null; className?: string }) {
  const url = useMediaThumbUrl(asset);
  const [broken, setBroken] = useState(false);
  const isVideo = Boolean(asset?.mime_type.startsWith("video/"));
  const showVideo = isVideo && asset?.source_provider === "waveos";
  return (
    <span className={cn("block overflow-hidden border border-border bg-elevated", className)}>
      {url && !broken ? (
        showVideo ? (
          <video src={`${url}#t=0.1`} className="pointer-events-none h-full w-full object-cover" muted playsInline preload="metadata" onError={() => setBroken(true)} />
        ) : (
          <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
        )
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          {isVideo ? <Video className="h-4 w-4" /> : <Images className="h-4 w-4" />}
        </span>
      )}
    </span>
  );
}

function CampaignMediaTile({asset,selected,onToggle}:{asset:MediaAsset;selected:boolean;onToggle:()=>void}) {
  const url = useMediaThumbUrl(asset);
  const isVideo=asset.mime_type.startsWith("video/");
  return <button type="button" onClick={onToggle} aria-pressed={selected} aria-label={asset.name} className={cn("relative aspect-square overflow-hidden rounded-xl border bg-elevated",selected?"border-neon-cyan ring-2 ring-neon-cyan/30":"border-border")}>
    {url ? (isVideo ? <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" /> : <img src={url} alt={asset.name} className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center text-muted-foreground">{isVideo?<Video className="h-5 w-5"/>:<Images className="h-5 w-5"/>}</div>}
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent px-1.5 pb-1.5 pt-5 text-left text-[10px] text-foreground"><span className="line-clamp-1">{asset.name}</span></div>
    {isVideo && <span className="absolute left-1 top-1 rounded bg-background/70 p-0.5"><Video className="h-3 w-3" /></span>}
    {selected&&<span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground"><CheckCircle2 className="h-4 w-4"/></span>}
  </button>;
}

