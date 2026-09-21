import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import AdminStats from "@/components/admin/AdminStats";
import AdminEntityTable from "@/components/admin/AdminEntityTable";
import MovieUploadForm from "@/components/admin/MovieUploadForm";
import SeriesForm from "@/components/admin/SeriesForm";
import RevenueOverview from "@/components/admin/RevenueOverview";
import AdminPinGate from "@/components/admin/AdminPinGate";
import VenueForm from "@/components/admin/VenueForm";
import MusicUploadForm from "@/components/admin/MusicUploadForm";
import AdminEditDialog from "@/components/admin/AdminEditDialog";
import RecentActivity from "@/components/admin/RecentActivity";
import DriverTrackerMap from "@/components/admin/DriverTrackerMap";
import AdminReferrals from "@/components/admin/AdminReferrals";
import AdminSafety from "@/components/admin/AdminSafety";
import AdminAutoApprovals from "@/components/admin/AdminAutoApprovals";
import AdminInvoices from "@/components/admin/AdminInvoices";
import AdminAutomation from "@/components/admin/AdminAutomation";
import BroadcastTrendsChart from "@/components/admin/BroadcastTrendsChart";
import BankrollWeeklyChart from "@/components/dashboard/BankrollWeeklyChart";
import SlipBatchMonitor from "@/components/dashboard/SlipBatchMonitor";
import AdminStudioFeatures from "@/components/admin/AdminStudioFeatures";
import AdminSampleClearance from "@/components/admin/AdminSampleClearance";
import AdminCopyright from "@/components/admin/AdminCopyright";
import SponsorAdManager from "@/components/admin/SponsorAdManager";
import AdminPromoCodes from "@/components/admin/AdminPromoCodes";
import CardPricingAdmin from "@/components/admin/CardPricingAdmin";
import AdminBypass from "@/components/admin/AdminBypass";
import AdminGame from "@/components/admin/AdminGame";
import ReplyToCuratorDialog from "@/components/admin/ReplyToCuratorDialog";
import DeliveryOpsPanel from "@/components/admin/DeliveryOpsPanel";
import { Sparkles, Trophy, Send, Music2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const EDIT_FIELDS = {
  Movie: [
    { key: "title", label: "Title", type: "text" },
    { key: "genre", label: "Genre", type: "select", options: ["Action","Drama","Comedy","Horror","Romance","Sci-Fi","Documentary","Animation","Thriller","Adventure"] },
    { key: "price", label: "Price (₦)", type: "number" },
    { key: "is_free", label: "Free", type: "boolean" },
    { key: "is_ad_supported", label: "Ad supported", type: "boolean" },
    { key: "featured", label: "Featured", type: "boolean" },
    { key: "series_id", label: "Series ID", type: "text" },
    { key: "season_number", label: "Season", type: "number" },
    { key: "episode_number", label: "Episode", type: "number" },
    { key: "episode_title", label: "Episode title", type: "text" },
    { key: "preview_seconds", label: "Preview seconds", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["pending","published","rejected"] },
    { key: "rating", label: "Rating", type: "number" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  Series: [
    { key: "title", label: "Title", type: "text" },
    { key: "genre", label: "Genre", type: "select", options: ["Action","Drama","Comedy","Horror","Romance","Sci-Fi","Documentary","Animation","Thriller","Adventure"] },
    { key: "total_seasons", label: "Total seasons", type: "number" },
    { key: "featured", label: "Featured", type: "boolean" },
    { key: "status", label: "Status", type: "select", options: ["published","pending","hidden"] },
    { key: "description", label: "Description", type: "textarea" },
  ],
  Music: [
    { key: "title", label: "Title", type: "text" },
    { key: "artist", label: "Artist", type: "text" },
    { key: "genre", label: "Genre", type: "select", options: ["Afrobeats","Pop","Hip-Hop","Gospel","R&B","Dancehall","Highlife","Jazz","Reggae","Electronic"] },
    { key: "price", label: "Price (₦)", type: "number" },
    { key: "is_free", label: "Free", type: "boolean" },
    { key: "is_ad_supported", label: "Ad supported", type: "boolean" },
    { key: "featured", label: "Featured", type: "boolean" },
    { key: "status", label: "Status", type: "select", options: ["pending","published","rejected"] },
  ],
  MusicVideo: [
    { key: "title", label: "Title", type: "text" },
    { key: "artist", label: "Artist", type: "text" },
    { key: "genre", label: "Genre", type: "select", options: ["Afrobeats","Pop","Hip-Hop","Gospel","R&B","Dancehall","Highlife","Jazz","Reggae","Electronic"] },
    { key: "price", label: "Price (₦)", type: "number" },
    { key: "is_free", label: "Free", type: "boolean" },
    { key: "is_ad_supported", label: "Ad supported", type: "boolean" },
    { key: "featured", label: "Featured", type: "boolean" },
    { key: "status", label: "Status", type: "select", options: ["pending","published","rejected"] },
  ],
  Venue: [
    { key: "name", label: "Name", type: "text" },
    { key: "category", label: "Category", type: "select", options: ["Fine Dining","Casual","Fast Food","Sports Bar","Cocktail Lounge","Nightclub","Wine Bar","Rooftop Bar","Beach Bar","Pub & Grill"] },
    { key: "price_level", label: "Price level", type: "select", options: ["$","$$","$$$","$$$$"] },
    { key: "rating", label: "Rating", type: "number" },
    { key: "address", label: "Address", type: "text" },
    { key: "featured", label: "Featured", type: "boolean" },
    { key: "status", label: "Status", type: "select", options: ["active","hidden"] },
    { key: "description", label: "Description", type: "textarea" },
  ],
  Ride: [
    { key: "offer_amount", label: "Offer ($)", type: "number" },
    { key: "accepted_amount", label: "Accepted fare ($)", type: "number" },
    { key: "ride_type", label: "Type", type: "select", options: ["economy","comfort","xl","bike"] },
    { key: "status", label: "Status", type: "select", options: ["searching","driver_assigned","arriving","in_progress","completed","cancelled"] },
    { key: "payment_status", label: "Payment", type: "select", options: ["unpaid","paid","refunded"] },
  ],
  LogisticsRequest: [
    { key: "amount", label: "Amount ($)", type: "number" },
    { key: "delivery_speed", label: "Speed", type: "select", options: ["express","standard","economy"] },
    { key: "status", label: "Status", type: "select", options: ["pending","driver_assigned","pickup","in_transit","arriving_soon","delivered","cancelled"] },
    { key: "payment_status", label: "Payment", type: "select", options: ["unpaid","paid","refunded"] },
  ],
  EquipmentRental: [
    { key: "model", label: "Machine", type: "text" },
    { key: "daily_rate", label: "Daily rate ($)", type: "number" },
    { key: "total_amount", label: "Total ($)", type: "number" },
    { key: "rental_period", label: "Period", type: "select", options: ["daily","weekly","monthly"] },
    { key: "with_operator", label: "With operator", type: "boolean" },
    { key: "status", label: "Status", type: "select", options: ["pending","approved","active","completed","cancelled"] },
    { key: "payment_status", label: "Payment", type: "select", options: ["unpaid","paid","refunded"] },
  ],
  CarwashBooking: [
    { key: "service_type", label: "Service", type: "text" },
    { key: "total_amount", label: "Total ($)", type: "number" },
    { key: "location_type", label: "Type", type: "select", options: ["mobile","fixed"] },
    { key: "status", label: "Status", type: "select", options: ["pending","confirmed","in_progress","completed","cancelled"] },
    { key: "payment_status", label: "Payment", type: "select", options: ["unpaid","paid","refunded"] },
  ],
  Transaction: [
    { key: "amount", label: "Amount", type: "number" },
    { key: "currency", label: "Currency", type: "select", options: ["USD","NGN"] },
    { key: "service", label: "Service", type: "select", options: ["ride","logistics","equipment","carwash","movie","subscription","ads"] },
    { key: "method", label: "Method", type: "select", options: ["card","bank_transfer","opay_wallet"] },
    { key: "status", label: "Status", type: "select", options: ["pending","paid","failed","refunded"] },
    { key: "description", label: "Description", type: "text" },
  ],
  RestaurantBooking: [
    { key: "venue_name", label: "Venue", type: "text" },
    { key: "booking_date", label: "Date", type: "text" },
    { key: "number_of_guests", label: "Guests", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["pending","confirmed","seated","completed","cancelled"] },
  ],
  Driver: [
    { key: "full_name", label: "Name", type: "text" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "vehicle_type", label: "Vehicle", type: "select", options: ["economy","comfort","xl","bike","van","truck"] },
    { key: "license_plate", label: "Plate", type: "text" },
    { key: "vehicle_color", label: "Color", type: "text" },
    { key: "driver_license", label: "License #", type: "text" },
    { key: "profile_photo_url", label: "Profile photo", type: "doc" },
    { key: "driver_license_url", label: "Driver's licence", type: "doc" },
    { key: "vehicle_registration_url", label: "Vehicle registration", type: "doc" },
    { key: "insurance_url", label: "Proof of insurance", type: "doc" },
    { key: "inspection_url", label: "Inspection doc", type: "doc" },
    { key: "id_document_url", label: "ID document", type: "doc" },
    { key: "bank_name", label: "Bank name", type: "text" },
    { key: "bank_account_name", label: "Account name", type: "text" },
    { key: "bank_account_number", label: "Account number", type: "text" },
    { key: "commission_rate", label: "Commission rate", type: "number" },
    { key: "is_promoted", label: "Promoted (boost)", type: "boolean" },
    { key: "fleet_id", label: "Fleet ID", type: "text" },
    { key: "background_check_status", label: "Background check", type: "select", options: ["not_started","in_progress","passed","failed","expired"] },
    { key: "background_check_date", label: "Check date", type: "text" },
    { key: "background_check_next_due", label: "Next due", type: "text" },
    { key: "insurance_status", label: "Insurance", type: "select", options: ["pending","verified","expired","invalid"] },
    { key: "insurance_expiry_date", label: "Insurance expiry", type: "text" },
    { key: "rating", label: "Rating", type: "number" },
    { key: "is_approved", label: "Approved", type: "boolean" },
    { key: "is_online", label: "Online", type: "boolean" },
  ],
  MarketplaceListing: [
    { key: "title", label: "Title", type: "text" },
    { key: "price", label: "Price", type: "number" },
    { key: "currency", label: "Currency", type: "select", options: ["USD","NGN"] },
    { key: "condition", label: "Condition", type: "select", options: ["new","used"] },
    { key: "category", label: "Category", type: "select", options: ["Electronics","Phones","Fashion","Furniture","Vehicles","Caterpillar","Trailers","Trucks","Services","Agriculture","Property","Business","General"] },
    { key: "subcategory", label: "Subcategory", type: "text" },
    { key: "location", label: "Location", type: "text" },
    { key: "seller_name", label: "Seller", type: "text" },
    { key: "verified", label: "Verified seller", type: "boolean" },
    { key: "featured", label: "Featured", type: "boolean" },
    { key: "status", label: "Status", type: "select", options: ["active","reserved","sold","removed"] },
    { key: "description", label: "Description", type: "textarea" },
  ],
  MarketOrder: [
    { key: "listing_title", label: "Item", type: "text" },
    { key: "buyer_name", label: "Buyer", type: "text" },
    { key: "seller_name", label: "Seller", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "commission", label: "Commission", type: "number" },
    { key: "delivery_fee", label: "Delivery fee", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["escrow","in_transit","delivered","completed","disputed","refunded"] },
    { key: "payment_status", label: "Payment", type: "select", options: ["held","released","refunded"] },
    { key: "dispute_reason", label: "Dispute reason", type: "textarea" },
    { key: "refund_reason", label: "Refund reason", type: "text" },
  ],
  MarketplaceReview: [
    { key: "reviewer_name", label: "Reviewer", type: "text" },
    { key: "reviewee_role", label: "Reviewed", type: "select", options: ["buyer","seller"] },
    { key: "rating", label: "Rating", type: "number" },
    { key: "review", label: "Review", type: "textarea" },
    { key: "complaint", label: "Complaint", type: "boolean" },
  ],
  DriverReview: [
    { key: "service", label: "Service", type: "select", options: ["ride","logistics"] },
    { key: "rating", label: "Rating", type: "number" },
    { key: "review", label: "Review", type: "textarea" },
    { key: "customer_name", label: "Customer", type: "text" },
    { key: "courier_name", label: "Courier", type: "text" },
    { key: "complaint", label: "Complaint", type: "boolean" },
  ],
  RewardProfile: [
    { key: "points", label: "Points", type: "number" },
    { key: "level", label: "Level", type: "select", options: ["Bronze","Silver","Gold","Platinum","Diamond"] },
    { key: "streak_days", label: "Streak", type: "number" },
    { key: "owner_name", label: "Owner", type: "text" },
  ],
  TVStation: [
    { key: "name", label: "Name", type: "text" },
    { key: "category", label: "Category", type: "select", options: ["News","Sports","Entertainment","Music","Movies","Kids","Family","Religion","Documentary"] },
    { key: "youtube_id", label: "YouTube ID / live stream ID", type: "text" },
    { key: "country", label: "Country", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "logo_url", label: "Logo URL", type: "text" },
    { key: "featured", label: "Featured", type: "boolean" },
    { key: "is_sponsored", label: "Sponsored", type: "boolean" },
    { key: "sponsor_name", label: "Sponsor name", type: "text" },
    { key: "sponsor_logo", label: "Sponsor logo URL", type: "text" },
    { key: "sort_order", label: "Sort order", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["active","hidden"] },
  ],
  Concert: [
    { key: "artist", label: "Artist", type: "text" },
    { key: "title", label: "Title", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "poster_url", label: "Poster URL", type: "text" },
    { key: "stream_url", label: "Stream URL", type: "text" },
    { key: "ticket_price_regular", label: "Regular price", type: "number" },
    { key: "ticket_price_vip", label: "VIP price", type: "number" },
    { key: "event_date", label: "Event date", type: "text" },
    { key: "venue", label: "Venue", type: "text" },
    { key: "is_live", label: "Live now", type: "boolean" },
    { key: "tickets_sold", label: "Tickets sold", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["scheduled","live","ended","cancelled"] },
  ],
  ConcertTicket: [
    { key: "concert_title", label: "Concert", type: "text" },
    { key: "artist", label: "Artist", type: "text" },
    { key: "user_name", label: "Buyer", type: "text" },
    { key: "user_email", label: "Email", type: "text" },
    { key: "tier", label: "Tier", type: "select", options: ["regular","vip"] },
    { key: "price", label: "Price", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["active","refunded","cancelled"] },
  ],
  Curator: [
    { key: "name", label: "Name", type: "text" },
    { key: "platform", label: "Platform", type: "select", options: ["Spotify","Apple Music","YouTube Music","Audiomack","Boomplay","SoundCloud","Deezer"] },
    { key: "playlist_url", label: "Playlist URL", type: "text" },
    { key: "playlist_name", label: "Playlist name", type: "text" },
    { key: "follower_count", label: "Followers", type: "number" },
    { key: "genres", label: "Genres", type: "text" },
    { key: "bio", label: "Bio", type: "textarea" },
    { key: "is_free", label: "Free submissions", type: "boolean" },
    { key: "status", label: "Status", type: "select", options: ["pending","approved","rejected","suspended"] },
  ],
  CuratorSubmission: [
    { key: "curator_name", label: "Curator", type: "text" },
    { key: "artist_name", label: "Artist", type: "text" },
    { key: "song_title", label: "Song", type: "text" },
    { key: "audio_url", label: "Audio URL", type: "text" },
    { key: "genre", label: "Genre", type: "text" },
    { key: "submitted_by_name", label: "Submitted by", type: "text" },
    { key: "fee_paid", label: "Fee paid", type: "number" },
    { key: "curator_review", label: "Curator review", type: "textarea" },
    { key: "curator_reply", label: "Curator reply (logged)", type: "textarea" },
    { key: "replied_at", label: "Replied at", type: "text" },
    { key: "status", label: "Status", type: "select", options: ["pending","accepted","rejected"] },
  ],
  PromotionPackage: [
    { key: "artist_name", label: "Artist", type: "text" },
    { key: "song_title", label: "Song", type: "text" },
    { key: "song_url", label: "Song URL", type: "text" },
    { key: "tier", label: "Tier", type: "select", options: ["basic","premium","ultimate"] },
    { key: "price", label: "Price", type: "number" },
    { key: "user_email", label: "Buyer email", type: "text" },
    { key: "features_included", label: "Features", type: "textarea" },
    { key: "notes", label: "Notes", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: ["pending","active","completed","cancelled"] },
  ],
  MusicDistribution: [
    { key: "artist_name", label: "Artist", type: "text" },
    { key: "song_title", label: "Song", type: "text" },
    { key: "audio_url", label: "Audio URL", type: "text" },
    { key: "cover_url", label: "Cover URL", type: "text" },
    { key: "platforms", label: "Platforms", type: "text" },
    { key: "user_email", label: "User email", type: "text" },
    { key: "fee_paid", label: "Fee paid", type: "number" },
    { key: "release_status", label: "Release status", type: "select", options: ["pending","distributing","live","rejected"] },
    { key: "earnings", label: "Earnings", type: "number" },
  ],
  LiveEvent: [
    { key: "title", label: "Title", type: "text" },
    { key: "event_type", label: "Type", type: "select", options: ["concert","festival","live_stream","meet_greet","album_launch"] },
    { key: "event_date", label: "Date & time", type: "text" },
    { key: "venue", label: "Venue", type: "text" },
    { key: "city", label: "City", type: "text" },
    { key: "venue_type", label: "Venue type", type: "select", options: ["indoor","outdoor","virtual"] },
    { key: "artist_lineup", label: "Artist lineup", type: "text" },
    { key: "genres", label: "Genres", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "banner_url", label: "Banner URL", type: "text" },
    { key: "live_stream_url", label: "Live stream URL", type: "text" },
    { key: "ticket_regular_price", label: "Regular ₦", type: "number" },
    { key: "ticket_vip_price", label: "VIP ₦", type: "number" },
    { key: "ticket_early_bird_price", label: "Early bird ₦", type: "number" },
    { key: "ticket_group_price", label: "Group ₦", type: "number" },
    { key: "ticket_streaming_price", label: "Streaming ₦", type: "number" },
    { key: "early_bird_limit", label: "Early bird limit", type: "number" },
    { key: "capacity", label: "Capacity", type: "number" },
    { key: "tickets_sold", label: "Tickets sold", type: "number" },
    { key: "is_featured", label: "Featured", type: "boolean" },
    { key: "status", label: "Status", type: "select", options: ["pending","approved","on_sale","live","completed","cancelled"] },
  ],
  EventTicket: [
    { key: "event_title", label: "Event", type: "text" },
    { key: "user_name", label: "Buyer", type: "text" },
    { key: "user_email", label: "Email", type: "text" },
    { key: "ticket_type", label: "Type", type: "select", options: ["regular","vip","early_bird","group","streaming"] },
    { key: "price", label: "Price ₦", type: "number" },
    { key: "quantity", label: "Quantity", type: "number" },
    { key: "qr_code", label: "QR code", type: "text" },
    { key: "status", label: "Status", type: "select", options: ["pending","paid","used","cancelled","refunded"] },
  ],
  EventSubmission: [
    { key: "title", label: "Title", type: "text" },
    { key: "artist_lineup", label: "Artist lineup", type: "text" },
    { key: "event_date", label: "Date", type: "text" },
    { key: "venue", label: "Venue", type: "text" },
    { key: "city", label: "City", type: "text" },
    { key: "genres", label: "Genres", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "submitter_name", label: "Submitter", type: "text" },
    { key: "source", label: "Source", type: "select", options: ["user","promoter"] },
    { key: "status", label: "Status", type: "select", options: ["pending","approved","rejected"] },
  ],
  EventSponsor: [
    { key: "sponsor_name", label: "Sponsor", type: "text" },
    { key: "sponsor_logo", label: "Logo URL", type: "text" },
    { key: "amount", label: "Amount ₦", type: "number" },
    { key: "tier", label: "Tier", type: "select", options: ["platinum","gold","silver","bronze"] },
  ],
  Competition: [
    { key: "title", label: "Title", type: "text" },
    { key: "competition_type", label: "Type", type: "select", options: ["predict_win","fan_contest"] },
    { key: "theme", label: "Theme", type: "text" },
    { key: "week_key", label: "Week key", type: "text" },
    { key: "prize_coins", label: "Prize coins", type: "number" },
    { key: "prize_description", label: "Prize description", type: "textarea" },
    { key: "rules", label: "Rules", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: ["draft","active","voting","completed","cancelled"] },
  ],
  CompetitionEntry: [
    { key: "competition_title", label: "Competition", type: "text" },
    { key: "user_name", label: "User", type: "text" },
    { key: "entry_type", label: "Type", type: "select", options: ["prediction","video","image","text"] },
    { key: "caption", label: "Caption", type: "text" },
    { key: "content_url", label: "Content URL", type: "text" },
    { key: "score", label: "Score", type: "number" },
    { key: "votes", label: "Votes", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["pending","approved","rejected","winner"] },
  ],
  PerformanceSlot: [
    { key: "event_title", label: "Event", type: "text" },
    { key: "artist_name", label: "Artist", type: "text" },
    { key: "set_time", label: "Set time (ISO)", type: "text" },
    { key: "duration_minutes", label: "Duration (min)", type: "number" },
    { key: "slot_order", label: "Order", type: "number" },
    { key: "stage", label: "Stage", type: "text" },
    { key: "status", label: "Status", type: "select", options: ["scheduled","confirmed","performed","cancelled"] },
  ],
};


import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/pricing";
import { CONTACT } from "@/lib/catalog";

const E = base44.entities;

export default function Admin() {
  const [me, setMe] = React.useState(null);
  const [d, setD] = React.useState({ users: [], movies: [], series: [], music: [], musicVideos: [], rides: [], deliveries: [], rentals: [], washes: [], venues: [], tables: [], txs: [], ads: [], tickets: [], drivers: [], listings: [], reviews: [], rewardProfiles: [], rewardRedemptions: [], marketOrders: [], marketReviews: [], tvChannels: [], concerts: [], concertTickets: [], curators: [], curatorSubs: [], promotions: [], distributions: [], liveEvents: [], eventTickets: [], eventSubs: [], eventSponsors: [], competitions: [], competitionEntries: [], performanceSlots: [] });
  const [reply, setReply] = React.useState({});
  const [edit, setEdit] = React.useState({ open: false, entity: null, record: null, fields: [] });
  const [replyTarget, setReplyTarget] = React.useState(null);
  const [ticketFilter, setTicketFilter] = React.useState("open");

  const openEdit = (entity, record) => setEdit({ open: true, entity, record, fields: EDIT_FIELDS[entity] || [] });
  const closeEdit = () => setEdit((s) => ({ ...s, open: false }));

  // Firing ~35 list() calls in one Promise.all trips the Base44 rate limit.
  // Run them in small sequential batches with a brief pause so every table still
  // loads — each call is resilient so a transient 429 leaves that table empty
  // instead of crashing the whole admin panel.
  const safeList = async (entity, sort, limit) => {
    try { return await E[entity].list(sort, limit); } catch { return []; }
  };
  const runBatch = async (calls) => Promise.all(calls.map((c) => safeList(...c)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const load = async () => {
    const b1 = [
      ["User", "-created_date", 100], ["Movie", "-created_date", 100],
      ["Series", "-created_date", 100], ["Music", "-created_date", 100],
      ["MusicVideo", "-created_date", 100], ["Ride", "-created_date", 100],
      ["LogisticsRequest", "-created_date", 100], ["EquipmentRental", "-created_date", 100],
    ];
    const b2 = [
      ["CarwashBooking", "-created_date", 100], ["Venue", "-created_date", 100],
      ["RestaurantBooking", "-created_date", 100], ["Transaction", "-created_date", 200],
      ["AdEvent", "-created_date", 300], ["SupportTicket", "-created_date", 100],
      ["Driver", "-created_date", 100], ["MarketplaceListing", "-created_date", 100],
    ];
    const b3 = [
      ["DriverReview", "-created_date", 100], ["RewardProfile", "-created_date", 100],
      ["RewardRedemption", "-created_date", 100], ["MarketOrder", "-created_date", 100],
      ["MarketplaceReview", "-created_date", 100], ["TVStation", "-created_date", 100],
      ["Concert", "-event_date", 100], ["ConcertTicket", "-created_date", 100],
    ];
    const b4 = [
      ["Curator", "-created_date", 100], ["CuratorSubmission", "-created_date", 100],
      ["PromotionPackage", "-created_date", 100], ["MusicDistribution", "-created_date", 100],
      ["LiveEvent", "-event_date", 100], ["EventTicket", "-created_date", 100],
      ["EventSubmission", "-created_date", 100], ["EventSponsor", "-created_date", 100],
    ];
    const b5 = [
      ["Competition", "-created_date", 100], ["CompetitionEntry", "-created_date", 100],
      ["PerformanceSlot", "-created_date", 200],
    ];

    const [r1, r2, r3, r4, r5] = await Promise.all([
      runBatch(b1), wait(150).then(() => runBatch(b2)),
      wait(300).then(() => runBatch(b3)), wait(450).then(() => runBatch(b4)),
      wait(600).then(() => runBatch(b5)),
    ]);
    const all = [...r1, ...r2, ...r3, ...r4, ...r5];
    const [users, movies, series, music, musicVideos, rides, deliveries, rentals, washes, venues, tables, txs, ads, tickets, drivers, listings, reviews, rewardProfiles, rewardRedemptions, marketOrders, marketReviews, tvChannels, concerts, concertTickets, curators, curatorSubs, promotions, distributions, liveEvents, eventTickets, eventSubs, eventSponsors, competitions, competitionEntries, performanceSlots] = all;
    setD({ users, movies, series, music, musicVideos, rides, deliveries, rentals, washes, venues, tables, txs, ads, tickets, drivers, listings, reviews, rewardProfiles, rewardRedemptions, marketOrders, marketReviews, tvChannels, concerts, concertTickets, curators, curatorSubs, promotions, distributions, liveEvents, eventTickets, eventSubs, eventSponsors, competitions, competitionEntries, performanceSlots });
  };

  React.useEffect(() => {
    base44.auth.me().then((u) => { setMe(u); if (u.role === "admin") load(); }).catch(() => {});
  }, []);

  if (!me) return <p className="text-muted-foreground">Checking your access…</p>;
  if (me.role !== "admin")
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-10 text-center">
        <h2 className="text-xl font-bold">Admin access only</h2>
        <p className="text-sm text-muted-foreground mt-2">
          This control centre is restricted to RIDE X administrators. Contact {CONTACT.email}.
        </p>
      </div>
    );

  const counts = {
    rides: d.rides.length,
    deliveries: d.deliveries.length,
    movies: d.movies.length,
    venues: d.venues.length,
    tickets: d.tickets.filter((t) => t.status === "open").length,
  };

  const upd = (entity, id, data) => E[entity].update(id, data).then(load);
  const del = (entity, id) => E[entity].delete(id).then(load);

  const approveDriver = async (r) => {
    try {
      const res = await base44.functions.invoke("approve-driver", { driver_id: r.id });
      toast({
        title: "Driver approved",
        description: res?.data?.email ? `Login details emailed to ${res.data.email}` : "Login details sent",
      });
      load();
    } catch (e) {
      toast({ title: "Approval failed", description: e?.message || "Please try again" });
    }
  };

  const adRevenue = d.ads.reduce((s, a) => s + (a.revenue || 0), 0);

  return (
    <AdminPinGate>
    <div>
      <PageHeader eyebrow="Control centre" title="Admin" subtitle="Full control across every RIDE X service." />

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-6">
          {["overview", "revenue", "users", "movies", "series", "music", "rides", "logistics", "equipment", "carwash", "venues", "drivers", "marketplace", "entertainment", "events", "invoices", "automation", "auto-approve", "studio-features", "sample-clearance", "copyright", "reviews", "rewards", "ads", "sponsor-ads", "promo-codes", "transactions", "card-pricing", "tickets", "referrals", "safety", "game", "bypass", "settings"].map((t) => (
            <TabsTrigger key={t} value={t} className="rounded-full px-4 py-1.5 text-xs capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <AdminStats data={{ txs: d.txs, ads: d.ads, counts }} />
          <RecentActivity rides={d.rides} deliveries={d.deliveries} rentals={d.rentals} washes={d.washes} tables={d.tables} tickets={d.tickets} />
          <BankrollWeeklyChart />
          <SlipBatchMonitor />
          <BroadcastTrendsChart />
        </TabsContent>

        <TabsContent value="revenue"><RevenueOverview ads={d.ads} txs={d.txs} /></TabsContent>

        <TabsContent value="users">
          <AdminEntityTable
            rows={d.users}
            columns={[
              { key: "full_name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "role", label: "Role" },
              { key: "created_date", label: "Joined", render: (r) => new Date(r.created_date).toLocaleDateString() },
            ]}
            actions={[
              { label: "Make admin", visible: (r) => r.role !== "admin", onClick: (r) => upd("User", r.id, { role: "admin" }) },
              { label: "Make user", visible: (r) => r.role === "admin" && r.id !== me.id, onClick: (r) => upd("User", r.id, { role: "user" }) },
            ]}
          />
        </TabsContent>

        <TabsContent value="movies" className="space-y-6">
          <MovieUploadForm onCreated={load} />
          <AdminEntityTable
            rows={d.movies}
            columns={[
              { key: "title", label: "Title", render: (r) => r.series_id ? `${r.episode_title || r.title} (S${r.season_number || 1}·E${r.episode_number || 1})` : r.title },
              { key: "genre", label: "Genre" },
              { key: "view_count", label: "Views" },
              { key: "price", label: "Price", render: (r) => money(r.price) },
              { key: "preview_seconds", label: "Preview", render: (r) => `${r.preview_seconds || 45}s` },
              { key: "status", label: "Status", status: true },
              { key: "featured", label: "Featured", render: (r) => (r.featured ? "Yes" : "No") },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("Movie", r) },
              { label: "Feature", visible: (r) => !r.featured, onClick: (r) => upd("Movie", r.id, { featured: true }) },
              { label: "Unfeature", visible: (r) => r.featured, onClick: (r) => upd("Movie", r.id, { featured: false }) },
              { label: "Delete", variant: "destructive", onClick: (r) => del("Movie", r.id) },
            ]}
          />
        </TabsContent>

        <TabsContent value="series" className="space-y-6">
          <SeriesForm onCreated={load} />
          <AdminEntityTable
            rows={d.series}
            empty="No series yet."
            columns={[
              { key: "title", label: "Series" },
              { key: "genre", label: "Genre" },
              { key: "total_seasons", label: "Seasons" },
              { key: "featured", label: "Featured", render: (r) => (r.featured ? "Yes" : "No") },
              { key: "status", label: "Status", status: true },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("Series", r) },
              { label: "Feature", visible: (r) => !r.featured, onClick: (r) => upd("Series", r.id, { featured: true }) },
              { label: "Delete", variant: "destructive", onClick: (r) => del("Series", r.id) },
            ]}
          />
        </TabsContent>

        <TabsContent value="music" className="space-y-6">
          <MusicUploadForm onCreated={load} />
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Audio tracks</h3>
            <AdminEntityTable
              rows={d.music}
              empty="No tracks yet."
              columns={[
                { key: "title", label: "Title" },
                { key: "artist", label: "Artist" },
                { key: "genre", label: "Genre" },
                { key: "plays", label: "Plays" },
                { key: "is_free", label: "Access", render: (r) => (r.is_free ? "Free" : money(r.price)) },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("Music", r) },
                { label: "Feature", visible: (r) => !r.featured, onClick: (r) => upd("Music", r.id, { featured: true }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("Music", r.id) },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Music videos</h3>
            <AdminEntityTable
              rows={d.musicVideos}
              empty="No music videos yet."
              columns={[
                { key: "title", label: "Title" },
                { key: "artist", label: "Artist" },
                { key: "genre", label: "Genre" },
                { key: "plays", label: "Plays" },
                { key: "is_free", label: "Access", render: (r) => (r.is_free ? "Free" : money(r.price)) },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("MusicVideo", r) },
                { label: "Feature", visible: (r) => !r.featured, onClick: (r) => upd("MusicVideo", r.id, { featured: true }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("MusicVideo", r.id) },
              ]}
            />
          </div>
        </TabsContent>

        <TabsContent value="rides">
          <AdminEntityTable
            rows={d.rides}
            columns={[
              { key: "pickup_address", label: "Pickup" },
              { key: "dest_address", label: "Destination" },
              { key: "driver_name", label: "Driver" },
              { key: "accepted_amount", label: "Fare", render: (r) => money(r.accepted_amount) },
              { key: "status", label: "Status", status: true },
              { key: "payment_status", label: "Payment", status: true },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("Ride", r) },
              { label: "Cancel", visible: (r) => r.status !== "completed" && r.status !== "cancelled", onClick: (r) => upd("Ride", r.id, { status: "cancelled" }) },
              { label: "Refund", visible: (r) => r.payment_status === "paid", onClick: (r) => upd("Ride", r.id, { payment_status: "refunded" }) },
            ]}
          />
        </TabsContent>

        <TabsContent value="logistics" className="space-y-6">
          <DeliveryOpsPanel />
          <AdminEntityTable
            rows={d.deliveries}
            columns={[
              { key: "tracking_number", label: "Tracking" },
              { key: "delivery_address", label: "To" },
              { key: "driver_name", label: "Courier" },
              { key: "amount", label: "Amount", render: (r) => money(r.amount) },
              { key: "status", label: "Status", status: true },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("LogisticsRequest", r) },
              { label: "Mark delivered", visible: (r) => r.status !== "delivered", onClick: (r) => upd("LogisticsRequest", r.id, { status: "delivered" }) },
              { label: "Cancel", visible: (r) => r.status !== "delivered", onClick: (r) => upd("LogisticsRequest", r.id, { status: "cancelled" }) },
            ]}
          />
        </TabsContent>

        <TabsContent value="equipment">
          <AdminEntityTable
            rows={d.rentals}
            columns={[
              { key: "model", label: "Machine" },
              { key: "site_address", label: "Site" },
              { key: "days", label: "Days" },
              { key: "total_amount", label: "Total", render: (r) => money(r.total_amount) },
              { key: "status", label: "Status", status: true },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("EquipmentRental", r) },
              { label: "Approve", visible: (r) => r.status === "pending", onClick: (r) => upd("EquipmentRental", r.id, { status: "approved" }) },
              { label: "Complete", visible: (r) => r.status !== "completed", onClick: (r) => upd("EquipmentRental", r.id, { status: "completed" }) },
            ]}
          />
        </TabsContent>

        <TabsContent value="carwash">
          <AdminEntityTable
            rows={d.washes}
            columns={[
              { key: "service_type", label: "Service" },
              { key: "location_type", label: "Type" },
              { key: "booking_date", label: "When" },
              { key: "total_amount", label: "Total", render: (r) => money(r.total_amount) },
              { key: "status", label: "Status", status: true },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("CarwashBooking", r) },
              { label: "Confirm", visible: (r) => r.status === "pending", onClick: (r) => upd("CarwashBooking", r.id, { status: "confirmed" }) },
              { label: "Complete", visible: (r) => r.status !== "completed", onClick: (r) => upd("CarwashBooking", r.id, { status: "completed" }) },
            ]}
          />
        </TabsContent>

        <TabsContent value="venues" className="space-y-6">
          <VenueForm onCreated={load} />
          <AdminEntityTable
            rows={d.venues}
            columns={[
              { key: "name", label: "Venue" },
              { key: "category", label: "Category" },
              { key: "rating", label: "Rating" },
              { key: "bookings_count", label: "Bookings" },
              { key: "status", label: "Status", status: true },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("Venue", r) },
              { label: "Feature", visible: (r) => !r.featured, onClick: (r) => upd("Venue", r.id, { featured: true }) },
              { label: "Hide", visible: (r) => r.status === "active", onClick: (r) => upd("Venue", r.id, { status: "hidden" }) },
              { label: "Show", visible: (r) => r.status === "hidden", onClick: (r) => upd("Venue", r.id, { status: "active" }) },
              { label: "Delete", variant: "destructive", onClick: (r) => del("Venue", r.id) },
            ]}
          />
          <AdminEntityTable
            rows={d.tables}
            empty="No table bookings yet."
            columns={[
              { key: "venue_name", label: "Venue" },
              { key: "booking_date", label: "When" },
              { key: "number_of_guests", label: "Guests" },
              { key: "status", label: "Status", status: true },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("RestaurantBooking", r) },
            ]}
          />
        </TabsContent>

        <TabsContent value="card-pricing">
          <CardPricingAdmin />
        </TabsContent>

        <TabsContent value="drivers" className="space-y-6">
          <DriverTrackerMap drivers={d.drivers} />
          <AdminEntityTable
            rows={d.drivers}
            empty="No drivers registered."
            columns={[
              { key: "full_name", label: "Driver" },
              { key: "vehicle_type", label: "Vehicle" },
              { key: "license_plate", label: "Plate" },
              { key: "phone", label: "Phone" },
              { key: "rating", label: "Rating", render: (r) => `${r.rating || 5}★` },
              { key: "is_approved", label: "Approved", render: (r) => (r.is_approved ? "Yes" : "No") },
              { key: "is_online", label: "Online", render: (r) => (r.is_online ? "Yes" : "No") },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("Driver", r) },
              { label: "Approve & send login", visible: (r) => !r.is_approved, onClick: (r) => approveDriver(r) },
              { label: "Suspend", visible: (r) => r.is_approved, onClick: (r) => upd("Driver", r.id, { is_approved: false }) },
              { label: "Delete", variant: "destructive", onClick: (r) => del("Driver", r.id) },
            ]}
          />
        </TabsContent>

        <TabsContent value="marketplace" className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Listings</h3>
            <AdminEntityTable
              rows={d.listings}
              empty="No marketplace listings."
              columns={[
                { key: "title", label: "Listing" },
                { key: "price", label: "Price", render: (r) => money(r.price, r.currency) },
                { key: "category", label: "Category" },
                { key: "seller_name", label: "Seller" },
                { key: "verified", label: "Verified", render: (r) => (r.verified ? "✓" : "—") },
                { key: "featured", label: "Featured", render: (r) => (r.featured ? "Yes" : "No") },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("MarketplaceListing", r) },
                { label: "Verify seller", visible: (r) => !r.verified, onClick: (r) => upd("MarketplaceListing", r.id, { verified: true }) },
                { label: "Unverify", visible: (r) => r.verified, onClick: (r) => upd("MarketplaceListing", r.id, { verified: false }) },
                { label: "Feature", visible: (r) => !r.featured, onClick: (r) => upd("MarketplaceListing", r.id, { featured: true }) },
                { label: "Unfeature", visible: (r) => r.featured, onClick: (r) => upd("MarketplaceListing", r.id, { featured: false }) },
                { label: "Boost 7d", visible: (r) => r.status === "active", onClick: (r) => upd("MarketplaceListing", r.id, { boost_until: new Date(Date.now() + 7 * 864e5).toISOString() }) },
                { label: "Remove", variant: "destructive", visible: (r) => r.status !== "removed", onClick: (r) => upd("MarketplaceListing", r.id, { status: "removed" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("MarketplaceListing", r.id) },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Orders &amp; disputes</h3>
            <AdminEntityTable
              rows={d.marketOrders}
              empty="No marketplace orders yet."
              columns={[
                { key: "listing_title", label: "Item" },
                { key: "buyer_name", label: "Buyer" },
                { key: "seller_name", label: "Seller" },
                { key: "amount", label: "Amount", render: (r) => money(r.amount) },
                { key: "status", label: "Status", status: true },
                { key: "payment_status", label: "Payment", status: true },
                { key: "created_date", label: "When", render: (r) => new Date(r.created_date).toLocaleDateString() },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("MarketOrder", r) },
                { label: "Resolve dispute", visible: (r) => r.status === "disputed", onClick: (r) => upd("MarketOrder", r.id, { status: "completed", payment_status: "released" }) },
                { label: "Force refund", variant: "destructive", visible: (r) => r.status !== "refunded", onClick: (r) => upd("MarketOrder", r.id, { status: "refunded", payment_status: "refunded" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("MarketOrder", r.id) },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Marketplace reviews</h3>
            <AdminEntityTable
              rows={d.marketReviews}
              empty="No marketplace reviews yet."
              columns={[
                { key: "reviewer_name", label: "Reviewer" },
                { key: "reviewee_role", label: "Reviewed" },
                { key: "rating", label: "Rating", render: (r) => `${r.rating}★` },
                { key: "review", label: "Review" },
                { key: "complaint", label: "Flag", render: (r) => (r.complaint ? "⚠" : "—") },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("MarketplaceReview", r) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("MarketplaceReview", r.id) },
              ]}
            />
          </div>
        </TabsContent>

        <TabsContent value="entertainment" className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">TV channels</h3>
              <button onClick={() => openEdit("TVStation", {})} className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-semibold">+ Add channel</button>
            </div>
            <AdminEntityTable
              rows={d.tvChannels}
              empty="No TV channels."
              columns={[
                { key: "name", label: "Channel" },
                { key: "category", label: "Category" },
                { key: "country", label: "Country" },
                { key: "youtube_id", label: "YouTube ID" },
                { key: "featured", label: "Featured", render: (r) => (r.featured ? "Yes" : "No") },
                { key: "is_sponsored", label: "Sponsored", render: (r) => (r.is_sponsored ? `Yes${r.sponsor_name ? ` · ${r.sponsor_name}` : ""}` : "No") },
                { key: "sort_order", label: "Order" },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("TVStation", r) },
                { label: "Feature", visible: (r) => !r.featured, onClick: (r) => upd("TVStation", r.id, { featured: true }) },
                { label: "Unfeature", visible: (r) => r.featured, onClick: (r) => upd("TVStation", r.id, { featured: false }) },
                { label: "Mark sponsored", visible: (r) => !r.is_sponsored, onClick: (r) => openEdit("TVStation", { ...r, is_sponsored: true }) },
                { label: "Remove sponsor", visible: (r) => r.is_sponsored, onClick: (r) => upd("TVStation", r.id, { is_sponsored: false, sponsor_name: "", sponsor_logo: "" }) },
                { label: "Hide", visible: (r) => r.status === "active", onClick: (r) => upd("TVStation", r.id, { status: "hidden" }) },
                { label: "Show", visible: (r) => r.status === "hidden", onClick: (r) => upd("TVStation", r.id, { status: "active" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("TVStation", r.id) },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Concerts &amp; tickets</h3>
            <AdminEntityTable
              rows={d.concerts}
              empty="No concerts."
              columns={[
                { key: "title", label: "Concert" },
                { key: "artist", label: "Artist" },
                { key: "event_date", label: "When", render: (r) => r.event_date ? new Date(r.event_date).toLocaleDateString() : "—" },
                { key: "tickets_sold", label: "Sold" },
                { key: "is_live", label: "Live", render: (r) => (r.is_live ? "Yes" : "No") },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("Concert", r) },
                { label: "Go live", visible: (r) => r.status === "scheduled", onClick: (r) => upd("Concert", r.id, { is_live: true, status: "live" }) },
                { label: "End", visible: (r) => r.status === "live", onClick: (r) => upd("Concert", r.id, { is_live: false, status: "ended" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("Concert", r.id) },
              ]}
            />
            <AdminEntityTable
              rows={d.concertTickets}
              empty="No concert tickets."
              columns={[
                { key: "concert_title", label: "Concert" },
                { key: "user_name", label: "Buyer" },
                { key: "tier", label: "Tier" },
                { key: "price", label: "Price", render: (r) => money(r.price) },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("ConcertTicket", r) },
                { label: "Refund", variant: "destructive", visible: (r) => r.status === "active", onClick: (r) => upd("ConcertTicket", r.id, { status: "refunded" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("ConcertTicket", r.id) },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Curators &amp; submissions</h3>
            <AdminEntityTable
              rows={d.curators}
              empty="No curators."
              columns={[
                { key: "name", label: "Curator" },
                { key: "platform", label: "Platform" },
                { key: "follower_count", label: "Followers" },
                { key: "is_free", label: "Free", render: (r) => (r.is_free ? "Yes" : "No") },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("Curator", r) },
                { label: "Approve", visible: (r) => r.status === "pending", onClick: (r) => upd("Curator", r.id, { status: "approved" }) },
                { label: "Suspend", visible: (r) => r.status === "approved", onClick: (r) => upd("Curator", r.id, { status: "suspended" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("Curator", r.id) },
              ]}
            />
            <AdminEntityTable
              rows={d.curatorSubs}
              empty="No curator submissions."
              columns={[
                { key: "song_title", label: "Song" },
                { key: "artist_name", label: "Artist" },
                { key: "curator_name", label: "Curator" },
                { key: "fee_paid", label: "Fee", render: (r) => money(r.fee_paid) },
                { key: "curator_reply", label: "Reply", render: (r) => (r.curator_reply ? `📩 ${r.curator_reply.slice(0, 40)}${r.curator_reply.length > 40 ? "…" : ""}` : "—") },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("CuratorSubmission", r) },
                { label: "Log reply", onClick: (r) => openEdit("CuratorSubmission", { ...r, _focusReply: true }) },
                { label: "Reply", onClick: (r) => setReplyTarget(r) },
                { label: "Accept", visible: (r) => r.status === "pending", onClick: (r) => upd("CuratorSubmission", r.id, { status: "accepted" }) },
                { label: "Reject", variant: "destructive", visible: (r) => r.status === "pending", onClick: (r) => upd("CuratorSubmission", r.id, { status: "rejected" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("CuratorSubmission", r.id) },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Promotion packages</h3>
            <AdminEntityTable
              rows={d.promotions}
              empty="No promotions."
              columns={[
                { key: "song_title", label: "Song" },
                { key: "artist_name", label: "Artist" },
                { key: "tier", label: "Tier" },
                { key: "price", label: "Price", render: (r) => money(r.price) },
                { key: "user_email", label: "Buyer" },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("PromotionPackage", r) },
                { label: "Activate", visible: (r) => r.status === "pending", onClick: (r) => upd("PromotionPackage", r.id, { status: "active" }) },
                { label: "Complete", visible: (r) => r.status === "active", onClick: (r) => upd("PromotionPackage", r.id, { status: "completed" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("PromotionPackage", r.id) },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Music distribution</h3>
            <AdminEntityTable
              rows={d.distributions}
              empty="No distribution releases."
              columns={[
                { key: "song_title", label: "Song" },
                { key: "artist_name", label: "Artist" },
                { key: "platforms", label: "Platforms" },
                { key: "fee_paid", label: "Fee", render: (r) => money(r.fee_paid) },
                { key: "release_status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("MusicDistribution", r) },
                { label: "Mark distributing", visible: (r) => r.release_status === "pending", onClick: (r) => upd("MusicDistribution", r.id, { release_status: "distributing" }) },
                { label: "Mark live", visible: (r) => r.release_status === "distributing", onClick: (r) => upd("MusicDistribution", r.id, { release_status: "live" }) },
                { label: "Reject", variant: "destructive", visible: (r) => r.release_status !== "rejected", onClick: (r) => upd("MusicDistribution", r.id, { release_status: "rejected" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("MusicDistribution", r.id) },
              ]}
            />
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Live Events & Tickets</h3>
              <p className="text-xs text-muted-foreground">Auto-discover events, approve submissions, manage tickets & sponsors.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="rounded-full" onClick={async () => {
                try {
                  toast({ title: "Scanning the web for events…" });
                  const res = await base44.functions.invoke("auto-find-events", { query: "upcoming Lagos Nigeria Afrobeats concerts festivals 2026" });
                  const data = res?.data || res;
                  toast({ title: `Found ${data.found || 0} events · ${data.created || 0} new` });
                  load();
                } catch (e) {
                  toast({ title: e.message || "Auto-find failed", variant: "destructive" });
                }
              }}>
                <Sparkles className="w-4 h-4" /> Auto-Find Events
              </Button>
              <Button variant="outline" className="rounded-full" onClick={async () => {
                try {
                  toast({ title: "Pushing tickets to matched fans…" });
                  const res = await base44.functions.invoke("auto-push-tickets", {});
                  const data = res?.data || res;
                  toast({ title: `Pushed ${data.reminders_pushed || 0} reminders · ${data.slots_created || 0} slots` });
                  load();
                } catch (e) {
                  toast({ title: e.message || "Auto-push failed", variant: "destructive" });
                }
              }}>
                <Send className="w-4 h-4" /> Auto-Push Tickets
              </Button>
              <Button variant="outline" className="rounded-full" onClick={async () => {
                try {
                  toast({ title: "Pushing paid songs to curators…" });
                  const res = await base44.functions.invoke("auto-push-to-curators", {});
                  const data = res?.data || res;
                  toast({ title: `${data.submissions_created || 0} curator submissions created` });
                  load();
                } catch (e) {
                  toast({ title: e.message || "Auto-push failed", variant: "destructive" });
                }
              }}>
                <Music2 className="w-4 h-4" /> Auto-Push to Curators
              </Button>
              <Button variant="outline" className="rounded-full" onClick={async () => {
                try {
                  toast({ title: "Creating weekly competitions…" });
                  const res = await base44.functions.invoke("auto-create-competition", {});
                  const data = res?.data || res;
                  toast({ title: `Created ${(data.created || []).length} competitions for ${data.week_key || "this week"}` });
                  load();
                } catch (e) {
                  toast({ title: e.message || "Auto-create failed", variant: "destructive" });
                }
              }}>
                <Trophy className="w-4 h-4" /> Auto-Create Competitions
              </Button>
            </div>
          </div>
          <AdminEntityTable
            rows={d.liveEvents}
            empty="No live events yet."
            columns={[
              { key: "title", label: "Event" },
              { key: "artist_lineup", label: "Artists" },
              { key: "event_date", label: "When", render: (r) => r.event_date ? new Date(r.event_date).toLocaleDateString() : "—" },
              { key: "city", label: "City" },
              { key: "source", label: "Source" },
              { key: "tickets_sold", label: "Sold" },
              { key: "status", label: "Status", status: true },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("LiveEvent", r) },
              { label: "Approve", visible: (r) => r.status === "pending", onClick: (r) => upd("LiveEvent", r.id, { status: "on_sale" }) },
              { label: "Go live", visible: (r) => r.status === "on_sale" || r.status === "approved", onClick: (r) => upd("LiveEvent", r.id, { status: "live" }) },
              { label: "End", visible: (r) => r.status === "live", onClick: (r) => upd("LiveEvent", r.id, { status: "completed" }) },
              { label: "Feature", visible: (r) => !r.is_featured, onClick: (r) => upd("LiveEvent", r.id, { is_featured: true }) },
              { label: "Delete", variant: "destructive", onClick: (r) => del("LiveEvent", r.id) },
            ]}
          />
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">User submissions</h4>
            <AdminEntityTable
              rows={d.eventSubs}
              empty="No submissions."
              columns={[
                { key: "title", label: "Event" },
                { key: "artist_lineup", label: "Artists" },
                { key: "submitter_name", label: "Submitted by" },
                { key: "source", label: "Source" },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("EventSubmission", r) },
                { label: "Approve", visible: (r) => r.status === "pending", onClick: async (r) => {
                  await E.LiveEvent.create({
                    title: r.title, artist_lineup: r.artist_lineup, event_date: r.event_date,
                    venue: r.venue, city: r.city, genres: r.genres, description: r.description,
                    ticket_regular_price: r.ticket_regular_price || 35000, status: "on_sale", source: r.source === "promoter" ? "promoter" : "user_submission",
                  });
                  await upd("EventSubmission", r.id, { status: "approved" });
                }},
                { label: "Reject", variant: "destructive", visible: (r) => r.status === "pending", onClick: (r) => upd("EventSubmission", r.id, { status: "rejected" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("EventSubmission", r.id) },
              ]}
            />
          </div>
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Sold tickets</h4>
            <AdminEntityTable
              rows={d.eventTickets}
              empty="No tickets sold."
              columns={[
                { key: "event_title", label: "Event" },
                { key: "user_name", label: "Buyer" },
                { key: "ticket_type", label: "Type" },
                { key: "price", label: "Price", render: (r) => money(r.price) },
                { key: "qr_code", label: "QR code" },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("EventTicket", r) },
                { label: "Refund", variant: "destructive", visible: (r) => r.status === "paid", onClick: (r) => upd("EventTicket", r.id, { status: "refunded" }) },
                { label: "Mark used", visible: (r) => r.status === "paid", onClick: (r) => upd("EventTicket", r.id, { status: "used", checked_in: true, checkin_time: new Date().toISOString() }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("EventTicket", r.id) },
              ]}
            />
          </div>
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Sponsors</h4>
            <AdminEntityTable
              rows={d.eventSponsors}
              empty="No sponsors."
              columns={[
                { key: "sponsor_name", label: "Sponsor" },
                { key: "tier", label: "Tier" },
                { key: "amount", label: "Amount", render: (r) => money(r.amount) },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("EventSponsor", r) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("EventSponsor", r.id) },
              ]}
            />
          </div>
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Performance slots (auto-generated)</h4>
            <AdminEntityTable
              rows={d.performanceSlots}
              empty="No slots yet — run Auto-Push Tickets to generate from artist lineups."
              columns={[
                { key: "event_title", label: "Event" },
                { key: "artist_name", label: "Artist" },
                { key: "set_time", label: "Set time", render: (r) => r.set_time ? new Date(r.set_time).toLocaleString() : "—" },
                { key: "duration_minutes", label: "Mins" },
                { key: "slot_order", label: "Order" },
                { key: "stage", label: "Stage" },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Confirm", visible: (r) => r.status === "scheduled", onClick: (r) => upd("PerformanceSlot", r.id, { status: "confirmed" }) },
                { label: "Performed", visible: (r) => r.status === "confirmed", onClick: (r) => upd("PerformanceSlot", r.id, { status: "performed" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("PerformanceSlot", r.id) },
              ]}
            />
          </div>
          <div>
            <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2">Weekly competitions</h4>
            <AdminEntityTable
              rows={d.competitions}
              empty="No competitions yet — run Auto-Create Competitions."
              columns={[
                { key: "title", label: "Competition" },
                { key: "competition_type", label: "Type" },
                { key: "week_key", label: "Week" },
                { key: "entry_count", label: "Entries" },
                { key: "prize_coins", label: "Prize coins" },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("Competition", r) },
                { label: "Move to voting", visible: (r) => r.status === "active", onClick: (r) => upd("Competition", r.id, { status: "voting" }) },
                { label: "Complete", visible: (r) => r.status === "voting", onClick: (r) => upd("Competition", r.id, { status: "completed" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("Competition", r.id) },
              ]}
            />
            <h4 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground mb-2 mt-4">Competition entries</h4>
            <AdminEntityTable
              rows={d.competitionEntries}
              empty="No entries yet."
              columns={[
                { key: "competition_title", label: "Competition" },
                { key: "user_name", label: "User" },
                { key: "entry_type", label: "Type" },
                { key: "score", label: "Score" },
                { key: "votes", label: "Votes" },
                { key: "status", label: "Status", status: true },
              ]}
              actions={[
                { label: "Approve", visible: (r) => r.status === "pending", onClick: (r) => upd("CompetitionEntry", r.id, { status: "approved" }) },
                { label: "Mark winner", visible: (r) => r.status !== "winner", onClick: (r) => upd("CompetitionEntry", r.id, { status: "winner" }) },
                { label: "Reject", variant: "destructive", visible: (r) => r.status === "pending", onClick: (r) => upd("CompetitionEntry", r.id, { status: "rejected" }) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("CompetitionEntry", r.id) },
              ]}
            />
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <AdminInvoices />
        </TabsContent>

        <TabsContent value="automation">
          <AdminAutomation />
        </TabsContent>

        <TabsContent value="auto-approve">
          <AdminAutoApprovals />
        </TabsContent>

        <TabsContent value="studio-features">
          <AdminStudioFeatures />
        </TabsContent>

        <TabsContent value="sample-clearance">
          <AdminSampleClearance />
        </TabsContent>

        <TabsContent value="copyright">
          <AdminCopyright />
        </TabsContent>

        <TabsContent value="reviews">
          <AdminEntityTable
            rows={d.reviews}
            empty="No driver reviews."
            columns={[
              { key: "service", label: "Service", render: (r) => (r.service === "logistics" ? "Logistics" : "Ride") },
              { key: "rating", label: "Stars", render: (r) => `${r.rating}★` },
              { key: "customer_name", label: "Customer" },
              { key: "courier_name", label: "Driver/Courier", render: (r) => r.courier_name || r.driver_id || "—" },
              { key: "review", label: "Review" },
              { key: "complaint", label: "Flag", render: (r) => (r.complaint ? "⚠ Complaint" : "Recommendation") },
              { key: "created_date", label: "When", render: (r) => new Date(r.created_date).toLocaleDateString() },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("DriverReview", r) },
              { label: "Delete", variant: "destructive", onClick: (r) => del("DriverReview", r.id) },
            ]}
          />
        </TabsContent>

        <TabsContent value="rewards" className="space-y-6">
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Reward profiles</h3>
            <AdminEntityTable
              rows={d.rewardProfiles}
              empty="No reward profiles."
              columns={[
                { key: "owner_name", label: "Member" },
                { key: "level", label: "Level" },
                { key: "points", label: "Points" },
                { key: "streak_days", label: "Streak" },
                { key: "total_redeemed", label: "Redeemed", render: (r) => r.total_redeemed || 0 },
              ]}
              actions={[
                { label: "Edit", onClick: (r) => openEdit("RewardProfile", r) },
                { label: "Delete", variant: "destructive", onClick: (r) => del("RewardProfile", r.id) },
              ]}
            />
          </div>
          <div>
            <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Redemptions</h3>
            <AdminEntityTable
              rows={d.rewardRedemptions}
              empty="No redemptions."
              columns={[
                { key: "reward_name", label: "Reward" },
                { key: "points_cost", label: "Cost" },
                { key: "created_date", label: "When", render: (r) => new Date(r.created_date).toLocaleDateString() },
              ]}
            />
          </div>
        </TabsContent>

        <TabsContent value="ads" className="space-y-6">
          <div className="rounded-3xl border border-primary/25 bg-primary/5 p-6">
            <p className="text-xs text-muted-foreground">Total ad revenue · settles via Paystack</p>
            <p className="text-3xl font-extrabold mt-1">{money(adRevenue)}</p>
          </div>
          <AdminEntityTable
            rows={d.ads.slice(0, 60)}
            empty="No ad activity yet."
            columns={[
              { key: "ad_type", label: "Format" },
              { key: "event", label: "Event" },
              { key: "movie_title", label: "Context" },
              { key: "revenue", label: "Revenue", render: (r) => money(r.revenue) },
              { key: "created_date", label: "When", render: (r) => new Date(r.created_date).toLocaleString() },
            ]}
          />
        </TabsContent>

        <TabsContent value="sponsor-ads">
          <SponsorAdManager />
        </TabsContent>

        <TabsContent value="promo-codes">
          <AdminPromoCodes />
        </TabsContent>

        <TabsContent value="transactions">
          <AdminEntityTable
            rows={d.txs}
            columns={[
              { key: "description", label: "Description" },
              { key: "service", label: "Service" },
              { key: "method", label: "Method" },
              { key: "amount", label: "Amount", render: (r) => money(r.amount, r.currency) },
              { key: "status", label: "Status", status: true },
              { key: "opay_account", label: "Settled to" },
            ]}
            actions={[
              { label: "Edit", onClick: (r) => openEdit("Transaction", r) },
              { label: "Refund", visible: (r) => r.status === "paid", onClick: (r) => upd("Transaction", r.id, { status: "refunded" }) },
            ]}
          />
        </TabsContent>

        <TabsContent value="tickets" className="space-y-4">
          <div className="flex gap-2 mb-2">
            {["open", "in_progress", "resolved", "all"].map((f) => (
              <button
                key={f}
                onClick={() => setTicketFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs ${ticketFilter === f ? "bg-primary text-primary-foreground font-semibold" : "bg-secondary text-muted-foreground"}`}
              >
                {f.replace("_", " ")}{f !== "all" ? ` · ${d.tickets.filter((t) => f === "all" ? true : t.status === f).length}` : ""}
              </button>
            ))}
          </div>
          {d.tickets.filter((t) => ticketFilter === "all" || t.status === ticketFilter).length === 0 && <p className="text-sm text-muted-foreground">No support tickets.</p>}
          {d.tickets.filter((t) => ticketFilter === "all" || t.status === ticketFilter).map((t) => (
            <div key={t.id} className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-semibold">{t.subject}</p>
                <span className="text-xs text-muted-foreground">{new Date(t.created_date).toLocaleString()}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {t.customer_email && <span className="inline-flex items-center gap-1 text-primary">✉ {t.customer_email}</span>}
                {t.service && <span>· {t.service}</span>}
              </div>
              <p className="text-sm text-muted-foreground">{t.message}</p>
              {t.admin_reply && <p className="text-sm p-3 rounded-xl bg-secondary">Reply: {t.admin_reply}</p>}
              <Textarea
                className="rounded-xl"
                placeholder="Write a reply…"
                value={reply[t.id] || ""}
                onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })}
              />
              <div className="flex gap-2">
                <Button size="sm" className="rounded-full" onClick={() => upd("SupportTicket", t.id, { admin_reply: reply[t.id] || "", status: "in_progress" })}>Send reply</Button>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => upd("SupportTicket", t.id, { status: "resolved" })}>Resolve</Button>
                {t.status !== "resolved" && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => upd("SupportTicket", t.id, { status: "open" })}>Reopen</Button>}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="referrals"><AdminReferrals /></TabsContent>

        <TabsContent value="safety" className="space-y-4">
          <h3 className="font-semibold text-base">Safety management</h3>
          <AdminSafety />
        </TabsContent>

        <TabsContent value="game" className="space-y-4">
          <Link to="/admin/game-assets" className="block rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 flex items-center gap-3 card-lift">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-bold">The Forgotten Ones</p>
              <h3 className="text-base font-extrabold text-foreground leading-tight">Game Asset Pipeline — Upload Full-Body Fighters</h3>
              <p className="text-xs text-muted-foreground">Upload full-body PNG/GLB assets for Babatunde & Corrupted Priest. Combat stays locked until assets exist.</p>
            </div>
            <span className="shrink-0 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-bold">Open ▸</span>
          </Link>
          <AdminGame />
        </TabsContent>

        <TabsContent value="bypass">
          <AdminBypass />
        </TabsContent>

        <TabsContent value="settings">
          <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-3 text-sm">
            <h3 className="font-semibold text-base">Platform settings</h3>
            <p><span className="text-muted-foreground">App name:</span> RIDE X</p>
            <p><span className="text-muted-foreground">Support email:</span> {CONTACT.email}</p>
            <p><span className="text-muted-foreground">Website:</span> {CONTACT.website}</p>
            <p><span className="text-muted-foreground">Social:</span> {CONTACT.social}</p>
            <p><span className="text-muted-foreground">Map provider:</span> Leaflet + OpenStreetMap (no API key required)</p>
            <p><span className="text-muted-foreground">Currencies:</span> USD, NGN</p>
            <p><span className="text-muted-foreground">OPay settlement account:</span> {CONTACT.opay}</p>
            <p><span className="text-muted-foreground">Privacy policy:</span> <Link to="/privacy" className="text-primary hover:underline">View privacy policy</Link></p>
            <p className="text-xs text-muted-foreground pt-2">
              Live card processing runs through Paystack. Add the Paystack webhook URL in your Paystack dashboard so successful payments auto-confirm orders.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <ReplyToCuratorDialog
        open={!!replyTarget}
        submission={replyTarget}
        onClose={() => setReplyTarget(null)}
        onSent={load}
      />

      <AdminEditDialog
        open={edit.open}
        onClose={closeEdit}
        entity={edit.entity}
        record={edit.record}
        fields={edit.fields}
        onSaved={load}
      />
    </div>
    </AdminPinGate>
  );
}