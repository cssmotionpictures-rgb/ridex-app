// Shared approval side-effect engine.
// Used by auto-submit-batch (for auto-approved features) and approve-submission
// (for manual admin/provider/artist/licensing approvals) so the logic lives once.

// Features that require NO human approval — activated instantly on payment.
export const AUTO_APPROVED = [
  "digital_product_purchase",
  "artist_analytics",
  "vip_tier",
  "live_chat",
  "digital_autograph",
  "ai_songwriter",
];

// Human-approver routing per feature type.
export function approverTypeFor(featureType) {
  if (AUTO_APPROVED.includes(featureType)) return "auto";
  if (featureType === "song_license") return "licensing_agency";
  if (featureType === "collaboration") return "provider";
  if (featureType === "fan_club") return "artist";
  return "admin";
}

const E = (b, name) => b.asServiceRole.entities[name];

// Apply the approval side effect for a feature. `action` is "approved" or "rejected".
// `referenceId` may be empty for user-attribute unlocks (vip_tier, artist_analytics).
// `extra` is an object parsed from submission.extra_data (may be empty).
export async function applySideEffect(base44, featureType, referenceId, action, extra) {
  const approved = action === "approved";
  const id = referenceId || "";
  const ex = extra || {};
  switch (featureType) {
    case "digital_product":
      await E(base44, "DigitalProduct").update(id, { status: approved ? "published" : "rejected" });
      break;
    case "digital_product_purchase":
      if (approved) {
        const p = await E(base44, "DigitalProduct").get(id);
        await E(base44, "DigitalProduct").update(id, { downloads: (p.downloads || 0) + 1 });
      }
      break;
    case "collaboration":
      await E(base44, "Collaboration").update(id, { status: approved ? "booked" : "cancelled" });
      break;
    case "song_premiere":
      await E(base44, "SongPremiere").update(id, { status: approved ? "scheduled" : "cancelled" });
      break;
    case "artist_showcase":
      await E(base44, "ArtistShowcase").update(id, { featured: approved, status: approved ? "approved" : "rejected" });
      break;
    case "movie_premiere":
      await E(base44, "MoviePremiere").update(id, { status: approved ? "scheduled" : "cancelled" });
      break;
    case "artist_analytics":
      if (approved && ex.user_id) {
        await E(base44, "User").update(ex.user_id, { has_analytics: true });
      }
      break;
    case "podcast_hosting":
      await E(base44, "Podcast").update(id, { status: approved ? "published" : "rejected" });
      break;
    case "vip_tier":
      if (approved && ex.user_id) {
        await E(base44, "User").update(ex.user_id, { vip_tier: ex.vip_tier || "bronze" });
      }
      break;
    case "live_chat":
      await E(base44, "LiveChat").update(id, { status: approved ? "scheduled" : "cancelled" });
      break;
    case "digital_autograph":
      await E(base44, "DigitalAutograph").update(id, { status: approved ? "delivered" : "rejected" });
      break;
    case "song_license":
      await E(base44, "SongLicense").update(id, { status: approved ? "active" : "rejected" });
      break;
    case "sponsored_content":
      await E(base44, "SponsoredContent").update(id, { status: approved ? "live" : "rejected" });
      break;
    case "ai_songwriter":
      await E(base44, "AiGeneration").update(id, { status: approved ? "completed" : "failed" });
      break;
    case "virtual_studio":
      await E(base44, "VirtualStudio").update(id, { status: approved ? "confirmed" : "cancelled" });
      break;
    case "merchandise":
      await E(base44, "Merchandise").update(id, { status: approved ? "active" : "rejected" });
      break;
    case "fan_club":
      if (approved) {
        const fc = await E(base44, "FanClub").get(id);
        await E(base44, "FanClub").update(id, { members: (fc.members || 0) + 1 });
      }
      break;
    case "remix_contest":
      await E(base44, "RemixEntry").update(id, { status: approved ? "accepted" : "rejected" });
      break;
    case "video_contest":
      await E(base44, "VideoEntry").update(id, { status: approved ? "accepted" : "rejected" });
      break;
    case "audiobook":
      await E(base44, "Audiobook").update(id, { status: approved ? "published" : "rejected" });
      break;
    default:
      break;
  }
}