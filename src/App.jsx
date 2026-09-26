import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
// Add page imports here
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppShell from '@/components/shell/AppShell';
import Landing from '@/pages/Landing';
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const RideX = lazy(() => import('@/pages/RideX'));
const RideTracking = lazy(() => import('@/pages/RideTracking'));
const LogisticsX = lazy(() => import('@/pages/LogisticsX'));
const DeliveryTracking = lazy(() => import('@/pages/DeliveryTracking'));
const Equipment = lazy(() => import('@/pages/Equipment'));
const EquipmentRentalAgreement = lazy(() => import('@/pages/EquipmentRentalAgreement'));
const Carwash = lazy(() => import('@/pages/Carwash'));
const Venues = lazy(() => import('@/pages/Venues'));
const Movies = lazy(() => import('@/pages/Movies'));
const LiveSports = lazy(() => import('@/pages/LiveSports'));
const FxBeast = lazy(() => import('@/pages/FxBeast'));
const MonsterEngine = lazy(() => import('@/pages/MonsterEngine'));
const WinRaba = lazy(() => import('@/pages/WinRaba'));
const Kala = lazy(() => import('@/pages/Kala'));
const RunO = lazy(() => import('@/pages/RunO'));
import IntelligenceRoute from '@/components/intelligence/IntelligenceRoute';
const SportsForum = lazy(() => import('@/pages/SportsForum'));
const SportsForumThread = lazy(() => import('@/pages/SportsForumThread'));
const SportsHighlights = lazy(() => import('@/pages/SportsHighlights'));
const SportsWorldCup = lazy(() => import('@/pages/SportsWorldCup'));
const SportsSources = lazy(() => import('@/pages/SportsSources'));
const SportsMatch = lazy(() => import('@/pages/SportsMatch'));
const PlayerStats = lazy(() => import('@/pages/PlayerStats'));
const MovieDetail = lazy(() => import('@/pages/MovieDetail'));
const Music = lazy(() => import('@/pages/Music'));
const Profile = lazy(() => import('@/pages/Profile'));
const Support = lazy(() => import('@/pages/Support'));
const Admin = lazy(() => import('@/pages/Admin'));
const PaymentSuccess = lazy(() => import('@/pages/PaymentSuccess'));
const PaymentCancelled = lazy(() => import('@/pages/PaymentCancelled'));
const Preview = lazy(() => import('@/pages/Preview'));
const SeriesDetail = lazy(() => import('@/pages/SeriesDetail'));
const AiMaster = lazy(() => import('@/pages/AiMaster'));
const MasterReports = lazy(() => import('@/pages/MasterReports'));
const DriverSignup = lazy(() => import('@/pages/DriverSignup'));
const DriverApp = lazy(() => import('@/pages/DriverApp'));
const Marketplace = lazy(() => import('@/pages/Marketplace'));
const TVStations = lazy(() => import('@/pages/TVStations'));
const Concerts = lazy(() => import('@/pages/Concerts'));
const Curators = lazy(() => import('@/pages/Curators'));
const AutoPromote = lazy(() => import('@/pages/AutoPromote'));
const ArtistPromotion = lazy(() => import('@/pages/ArtistPromotion'));
const MusicDistribution = lazy(() => import('@/pages/MusicDistribution'));
const Events = lazy(() => import('@/pages/Events'));
const EventDetail = lazy(() => import('@/pages/EventDetail'));
const EventPreferences = lazy(() => import('@/pages/EventPreferences'));
const Competitions = lazy(() => import('@/pages/Competitions'));
const RewardHub = lazy(() => import('@/pages/RewardHub'));
const RideXCard = lazy(() => import('@/pages/RideXCard'));
const VirtualCards = lazy(() => import('@/pages/VirtualCards'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Safety = lazy(() => import('@/pages/Safety'));
const ReferralLanding = lazy(() => import('@/pages/ReferralLanding'));
const ReferralPortal = lazy(() => import('@/pages/ReferralPortal'));
const DriverSafety = lazy(() => import('@/pages/DriverSafety'));
const Terms = lazy(() => import('@/pages/Terms'));
const DriverTerms = lazy(() => import('@/pages/DriverTerms'));
const DigitalMarketplace = lazy(() => import('@/pages/DigitalMarketplace'));
const VIPTiers = lazy(() => import('@/pages/VIPTiers'));
const SongLicensing = lazy(() => import('@/pages/SongLicensing'));
const FanClubs = lazy(() => import('@/pages/FanClubs'));
const Collaborations = lazy(() => import('@/pages/Collaborations'));
const Approvals = lazy(() => import('@/pages/Approvals'));
const Influencers = lazy(() => import('@/pages/Influencers'));
const InfluencerDashboard = lazy(() => import('@/pages/InfluencerDashboard'));
const TalentDiscovery = lazy(() => import('@/pages/TalentDiscovery'));
const TalentProfile = lazy(() => import('@/pages/TalentProfile'));
const TalentBookings = lazy(() => import('@/pages/TalentBookings'));
const TalentArtistDashboard = lazy(() => import('@/pages/TalentArtistDashboard'));
const AgencyBlacklist = lazy(() => import('@/pages/AgencyBlacklist'));
const TourRuns = lazy(() => import('@/pages/TourRuns'));
const AgencyBookings = lazy(() => import('@/pages/AgencyBookings'));
const MediaAmplification = lazy(() => import('@/pages/MediaAmplification'));
const TarmacProtocol = lazy(() => import('@/pages/TarmacProtocol'));
const RosterBroadcast = lazy(() => import('@/pages/RosterBroadcast'));
const StudioFeatures = lazy(() => import('@/pages/StudioFeatures'));
const SampleClearance = lazy(() => import('@/pages/SampleClearance'));
const CopyrightProtection = lazy(() => import('@/pages/CopyrightProtection'));
const GameHub = lazy(() => import('@/pages/GameHub'));
const Receipts = lazy(() => import('@/pages/Receipts'));
const ZeroRejection = lazy(() => import('@/pages/ZeroRejection'));
const EmailSubscribe = lazy(() => import('@/pages/EmailSubscribe'));
const EmailBroadcast = lazy(() => import('@/pages/EmailBroadcast'));
const ProposalLab = lazy(() => import('@/pages/ProposalLab'));
const WatchAds = lazy(() => import('@/pages/WatchAds'));
const AdminGameAssets = lazy(() => import('@/pages/AdminGameAssets'));
import Babatunde3DTest from '@/components/game/Babatunde3DTest';
const FbxArenaTest = lazy(() => import('@/pages/FbxArenaTest'));
const BusinessBlueprints = lazy(() => import('@/pages/BusinessBlueprints'));
const DeliveryStatus = lazy(() => import('@/pages/DeliveryStatus'));
const OpportunityRadar = lazy(() => import('@/pages/OpportunityRadar'));
const LiveSportsMonitor = lazy(() => import('@/pages/LiveSportsMonitor'));
const TrackPackage = lazy(() => import('@/pages/TrackPackage'));
const AdEarnings = lazy(() => import('@/pages/AdEarnings'));
const ResultsHistory = lazy(() => import('@/pages/ResultsHistory'));
const Monster = lazy(() => import('@/pages/Monster'));
const SureWins = lazy(() => import('@/pages/SureWins'));
const Mingle = lazy(() => import('@/pages/Mingle'));
const CrixCoin = lazy(() => import('@/pages/CrixCoin'));
const CrixPayments = lazy(() => import('@/pages/CrixPayments'));
const CrixListingReadiness = lazy(() => import('@/pages/CrixListingReadiness'));
const CrxsAnalytics = lazy(() => import('@/pages/CrxsAnalytics'));
const CrxsLaunchControl = lazy(() => import('@/pages/CrxsLaunchControl'));
const CrxsMainnetLaunch = lazy(() => import('@/pages/CrxsMainnetLaunch'));
const CrixMoneyAdmin = lazy(() => import('@/pages/CrixMoneyAdmin'));
const QuickCoin = lazy(() => import('@/pages/QuickCoin'));
const BuyCrxs = lazy(() => import('@/pages/BuyCrxs'));
const CrxsMarket = lazy(() => import('@/pages/CrxsMarket'));
const CrxsDexLaunch = lazy(() => import('@/pages/CrxsDexLaunch'));

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  // Remember the page a signed-out visitor was trying to reach, so the login
  // page can send them back there instead of the landing page.
  const location = useLocation();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh] text-primary text-sm">Loading…</div>}>
<Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/payment-success" element={<PaymentSuccess />} />
      <Route path="/payment-cancelled" element={<PaymentCancelled />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/driver-terms" element={<DriverTerms />} />
      <Route path="/referral" element={<ReferralLanding />} />
      <Route path="/subscribe-email" element={<EmailSubscribe />} />
      <Route path="/track" element={<TrackPackage />} />
      <Route path="/preview/:type/:id" element={<Preview />} />
      <Route path="/buy" element={<BuyCrxs />} />
      <Route path="/market/crxs" element={<CrxsMarket />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to={"/login?returnTo=" + encodeURIComponent(location.pathname + location.search)} replace />} />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/ride" element={<RideX />} />
          <Route path="/ride-tracking" element={<RideTracking />} />
          <Route path="/logistics" element={<LogisticsX />} />
          <Route path="/delivery-tracking" element={<DeliveryTracking />} />
          <Route path="/equipment" element={<Equipment />} />
          <Route path="/equipment/agreement" element={<EquipmentRentalAgreement />} />
          <Route path="/carwash" element={<Carwash />} />
          <Route path="/venues" element={<Venues />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/sports" element={<LiveSports />} />
          <Route path="/fx-beast" element={<FxBeast />} />
          <Route path="/sports/forum" element={<SportsForum />} />
          <Route path="/sports/forum/:id" element={<SportsForumThread />} />
          <Route path="/sports/highlights" element={<SportsHighlights />} />
          <Route path="/sports/world-cup" element={<SportsWorldCup />} />
          <Route path="/sports/sources" element={<SportsSources />} />
          <Route path="/sports/match/:id" element={<SportsMatch />} />
          <Route path="/player-stats" element={<PlayerStats />} />
          <Route path="/series" element={<Movies />} />
          <Route path="/series/:id" element={<SeriesDetail />} />
          <Route path="/movie" element={<MovieDetail />} />
          <Route path="/music" element={<Music />} />
          <Route path="/ai-master" element={<AiMaster />} />
          <Route path="/master-reports" element={<MasterReports />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/tv" element={<TVStations />} />
          <Route path="/concerts" element={<Concerts />} />
          <Route path="/curators" element={<Curators />} />
          <Route path="/auto-promote" element={<AutoPromote />} />
          <Route path="/promotion" element={<ArtistPromotion />} />
          <Route path="/distribution" element={<MusicDistribution />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/event-preferences" element={<EventPreferences />} />
          <Route path="/competitions" element={<Competitions />} />
          <Route path="/digital-market" element={<DigitalMarketplace />} />
          <Route path="/vip" element={<VIPTiers />} />
          <Route path="/licensing" element={<SongLicensing />} />
          <Route path="/fan-clubs" element={<FanClubs />} />
          <Route path="/collaborations" element={<Collaborations />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/influencers" element={<Influencers />} />
          <Route path="/influencer-dashboard" element={<InfluencerDashboard />} />
          <Route path="/talent" element={<TalentDiscovery />} />
          <Route path="/talent/:id" element={<TalentProfile />} />
          <Route path="/talent-bookings" element={<TalentBookings />} />
          <Route path="/talent-dashboard" element={<TalentArtistDashboard />} />
          <Route path="/agency/blacklist" element={<AgencyBlacklist />} />
          <Route path="/agency/tours" element={<TourRuns />} />
          <Route path="/agency/media" element={<MediaAmplification />} />
          <Route path="/agency/tarmac" element={<TarmacProtocol />} />
          <Route path="/agency/broadcast" element={<RosterBroadcast />} />
          <Route path="/agency/bookings" element={<AgencyBookings />} />
          <Route path="/studio-features" element={<StudioFeatures />} />
          <Route path="/sample-clearance" element={<SampleClearance />} />
          <Route path="/copyright" element={<CopyrightProtection />} />
          <Route path="/game" element={<GameHub />} />
          <Route path="/game/babatunde-test" element={<Babatunde3DTest />} />
          <Route path="/fbx-arena-test" element={<FbxArenaTest />} />
          <Route path="/business-blueprints" element={<BusinessBlueprints />} />
          <Route path="/delivery-status" element={<DeliveryStatus />} />
          <Route path="/opportunity-radar" element={<OpportunityRadar />} />
          <Route path="/live-sports-monitor" element={<LiveSportsMonitor />} />
          <Route path="/monster-engine" element={<MonsterEngine />} />
          <Route path="/win-raba" element={<WinRaba />} />
          <Route path="/kala" element={<Kala />} />
          <Route path="/run-o" element={<RunO />} />
          <Route path="/monster" element={<Monster />} />
          <Route path="/sure-wins" element={<SureWins />} />
          <Route path="/mingle" element={<Mingle />} />
          <Route path="/crix" element={<CrixCoin />} />
          <Route path="/payments" element={<CrixPayments />} />
          <Route path="/quickcoin" element={<QuickCoin />} />
          <Route path="/results" element={<ResultsHistory />} />
          <Route path="/intelligence" element={<IntelligenceRoute />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/ad-earnings" element={<AdEarnings />} />
          <Route path="/zero-rejection" element={<ZeroRejection />} />
          <Route path="/email-broadcast" element={<EmailBroadcast />} />
          <Route path="/proposal-lab" element={<ProposalLab />} />
          <Route path="/watch-ads" element={<WatchAds />} />
          <Route path="/rewards" element={<RewardHub />} />
          <Route path="/card" element={<RideXCard />} />
          <Route path="/virtual-cards" element={<VirtualCards />} />
          <Route path="/driver-signup" element={<DriverSignup />} />
          <Route path="/driver-app" element={<DriverApp />} />
          <Route path="/driver-safety" element={<DriverSafety />} />
          <Route path="/safety" element={<Safety />} />
          <Route path="/referral-portal" element={<ReferralPortal />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/support" element={<Support />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/listing-readiness" element={<CrixListingReadiness />} />
            <Route path="/admin/crxs-analytics" element={<CrxsAnalytics />} />
            <Route path="/admin/crxs-launch" element={<CrxsLaunchControl />} />
            <Route path="/admin/crxs-mainnet" element={<CrxsMainnetLaunch />} />
            <Route path="/admin/crxs-dex" element={<CrxsDexLaunch />} />
            <Route path="/admin/crix-money" element={<CrixMoneyAdmin />} />
            <Route path="/admin/game-assets" element={<AdminGameAssets />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
</Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App