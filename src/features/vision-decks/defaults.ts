import type { VisionDeckContent } from "./types";

export function createDefaultVisionDeckContent(companyName = "Your next client"): VisionDeckContent {
  return {
    cover: {
      eyebrow: "A Dream Wave Media vision",
      headline: `A content system built to move ${companyName} forward.`,
      subhead:
        "A focused creative direction that turns your expertise into attention, trust, and measurable business momentum.",
    },
    discovery: {
      summary:
        "You have a strong story and a real opportunity to communicate it more consistently. The goal is to build content that feels unmistakably yours—and gives every campaign a job to do.",
      audience: "Decision-makers who value expertise, clarity, and a premium experience.",
      goals: [
        "Build stronger brand recognition",
        "Create a repeatable social content engine",
        "Turn attention into qualified conversations",
      ],
      challenges: [
        "The current content does not fully reflect the quality of the business",
        "Production happens in isolated bursts instead of a connected system",
        "Prospects need a faster way to understand the value",
      ],
    },
    direction: {
      title: "Confident. Human. Cinematic.",
      narrative:
        "We will pair premium imagery with clear, conversational storytelling. Every frame should feel intentional, while every message remains easy to understand and useful to the audience.",
      keywords: ["Cinematic", "Credible", "Warm", "Modern"],
      references: [],
    },
    plan: {
      narrative:
        "One production day becomes an interconnected library of hero, campaign, and social content—giving the team more ways to stay visible without starting from zero each week.",
      deliverables: [
        {
          id: "deliverable-hero",
          quantity: 1,
          title: "Hero brand story",
          description: "A flagship film that communicates the company story and point of view.",
          platform: "Web + YouTube",
        },
        {
          id: "deliverable-social",
          quantity: 8,
          title: "Vertical social videos",
          description: "Short-form stories designed around strong hooks and clear next actions.",
          platform: "Instagram + TikTok + LinkedIn",
        },
        {
          id: "deliverable-stills",
          quantity: 20,
          title: "Campaign stills",
          description: "A flexible photography library for launches, social, and sales collateral.",
          platform: "Cross-platform",
        },
      ],
    },
    social: {
      handle: `@${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbrand"}`,
      hook: "What if your best sales story was already inside the work you do every day?",
      caption:
        "The strongest brands do not create more noise. They make their value easier to see. Here is what that looks like in practice.",
      callToAction: "Discover the story",
      videoUrl: "",
      posterUrl: "",
    },
    roi: {
      investment: 12500,
      months: 6,
      videosPerMonth: 8,
      averageViews: 3500,
      clickRate: 1.8,
      leadRate: 4,
      closeRate: 20,
      customerValue: 4500,
    },
    packages: {
      eyebrow: "Choose your campaign",
      headline: "Two ways to bring the vision to life.",
      introduction: "Compare the complete campaign experience with a focused, budget-conscious alternative.",
      currency: "USD",
      options: [
        {
          id: "package-option-1",
          name: "Client Package 1",
          price: 0,
          paymentPlan: "Add payment schedule",
          description: "Add a description of the complete campaign package and the value it provides.",
          deliverableCount: 0,
          features: ["Add package feature", "Add package feature", "Add package feature"],
          badge: "Recommended",
          callToAction: "Select Package 1",
          recommended: true,
        },
        {
          id: "package-option-2",
          name: "Client Package 2",
          price: 0,
          paymentPlan: "Add payment schedule",
          description: "Add a description of the focused or budget-conscious campaign package.",
          deliverableCount: 0,
          features: ["Add package feature", "Add package feature", "Add package feature"],
          badge: "Budget Friendly",
          callToAction: "Select Package 2",
          recommended: false,
        },
      ],
    },
    timeline: [
      {
        id: "timeline-strategy",
        phase: "Strategy",
        timing: "Week 1",
        detail: "Goals, audience, creative territory, and measurement plan.",
      },
      {
        id: "timeline-preproduction",
        phase: "Pre-production",
        timing: "Week 2",
        detail: "Concepts, scripts, schedule, locations, talent, and shot plan.",
      },
      {
        id: "timeline-production",
        phase: "Production",
        timing: "Week 3",
        detail: "A focused capture day designed around the complete content system.",
      },
      {
        id: "timeline-delivery",
        phase: "Edit & launch",
        timing: "Weeks 4–5",
        detail: "Editorial, internal review, client refinement, delivery, and rollout.",
      },
    ],
    close: {
      headline: "Let's make the future version of the brand visible.",
      body: "Dream Wave Media will turn the direction in this vision into a production plan your team can confidently execute and measure.",
      callToActionLabel: "Schedule the next conversation",
      callToActionUrl: "",
    },
  };
}
