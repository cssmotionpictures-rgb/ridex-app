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
import Dashboard from '@/pages/Dashboard';
import RideX from '@/pages/RideX';
import RideTracking from '@/pages/RideTracking';
import LogisticsX from '@/pages/LogisticsX';
import DeliveryTracking from '@/pages/DeliveryTracking';
import Equipment from '@/pages/Equipment';
import EquipmentRentalAgreement from '@/pages/EquipmentRentalAgreement';
import Carwash from '@/pages/Carwash';
import Venues from '@/pages/Venues';
import Movies from '@/pages/Movies';
import LiveSports from '@/pages/LiveSports';
import MonsterEngine from '@/pages/MonsterEngine';
import WinRaba from '@/pages/WinRaba';
import Kala from '@/pages/Kala';
import RunO from '@/pages/RunO';
import IntelligenceRoute from '@/components/intelligence/IntelligenceRoute';
import SportsForum from '@/pages/SportsForum';
import SportsForumThread from '@/pages/SportsForumThread';
import SportsHighlights from '@/pages/SportsHighlights';
import SportsWorldCup from '@/pages/SportsWorldCup';
import SportsSources from '@/pages/SportsSources';
import SportsMatch from '@/pages/SportsMatch';
import PlayerStats from '@/pages/PlayerStats';
import MovieDetail from '@/pages/MovieDetail';
import Music from '@/pages/Music';
import Profile from '@/pages/Profile';
import Support from '@/pages/Support';
import Admin from '@/pages/Admin';
import PaymentSuccess from '@/pages/PaymentSuccess';
import PaymentCancelled from '@/pages/PaymentCancelled';
import Preview from '@/pages/Preview';
import SeriesDetail from '@/pages/SeriesDetail';
import AiMaster from '@/pages/AiMaster';
import MasterReports from '@/pages/MasterReports';
import DriverSignup from '@/pages/DriverSignup';
import DriverApp from '@/pages/DriverApp';
import Marketplace from '@/pages/Marketplace';
import TVStations from '@/pages/TVStations';
import Concerts from '@/pages/Concerts';
import Curators from '@/pages/Curators';
import AutoPromote from '@/pages/AutoPromote';
import ArtistPromotion from '@/pages/ArtistPromotion';
import MusicDistribution from '@/pages/MusicDistribution';
import Events from '@/pages/Events';
import EventDetail from '@/pages/EventDetail';
import EventPreferences from '@/pages/EventPreferences';
import Competitions from '@/pages/Competitions';
import RewardHub from '@/pages/RewardHub';
import RideXCard from '@/pages/RideXCard';
import VirtualCards from '@/pages/VirtualCards';
import Privacy from '@/pages/Privacy';
import Safety from '@/pages/Safety';
import ReferralLanding from '@/pages/ReferralLanding';
import ReferralPortal from '@/pages/ReferralPortal';
import DriverSafety from '@/pages/DriverSafety';
import Terms from '@/pages/Terms';
import DriverTerms from '@/pages/DriverTerms';
import DigitalMarketplace from '@/pages/DigitalMarketplace';
import VIPTiers from '@/pages/VIPTiers';
import SongLicensing from '@/pages/SongLicensing';
import FanClubs from '@/pages/FanClubs';
import Collaborations from '@/pages/Collaborations';
import Approvals from '@/pages/Approvals';
import Influencers from '@/pages/Influencers';
import InfluencerDashboard from '@/pages/InfluencerDashboard';
import TalentDiscovery from '@/pages/TalentDiscovery';
import TalentProfile from '@/pages/TalentProfile';
import TalentBookings from '@/pages/TalentBookings';
import TalentArtistDashboard from '@/pages/TalentArtistDashboard';
import AgencyBlacklist from '@/pages/AgencyBlacklist';
import TourRuns from '@/pages/TourRuns';
import AgencyBookings from '@/pages/AgencyBookings';
import MediaAmplification from '@/pages/MediaAmplification';
import TarmacProtocol from '@/pages/TarmacProtocol';
import RosterBroadcast from '@/pages/RosterBroadcast';
import StudioFeatures from '@/pages/StudioFeatures';
import SampleClearance from '@/pages/SampleClearance';
import CopyrightProtection from '@/pages/CopyrightProtection';
import GameHub from '@/pages/GameHub';
import Receipts from '@/pages/Receipts';
import ZeroRejection from '@/pages/ZeroRejection';
import EmailSubscribe from '@/pages/EmailSubscribe';
import EmailBroadcast from '@/pages/EmailBroadcast';
import ProposalLab from '@/pages/ProposalLab';
import WatchAds from '@/pages/WatchAds';
import AdminGameAssets from '@/pages/AdminGameAssets';
import Babatunde3DTest from '@/components/game/Babatunde3DTest';
import FbxArenaTest from '@/pages/FbxArenaTest';
import BusinessBlueprints from '@/pages/BusinessBlueprints';
import DeliveryStatus from '@/pages/DeliveryStatus';
import OpportunityRadar from '@/pages/OpportunityRadar';
import LiveSportsMonitor from '@/pages/LiveSportsMonitor';
import TrackPackage from '@/pages/TrackPackage';
import AdEarnings from '@/pages/AdEarnings';
import ResultsHistory from '@/pages/ResultsHistory';
import Monster from '@/pages/Monster';
import SureWins from '@/pages/SureWins';
import Mingle from '@/pages/Mingle';
import CrixCoin from '@/pages/CrixCoin';
import CrixPayments from '@/pages/CrixPayments';
import CrixListingReadiness from '@/pages/CrixListingReadiness';
import CrxsAnalytics from '@/pages/CrxsAnalytics';
import CrxsLaunchControl from '@/pages/CrxsLaunchControl';
import CrxsMainnetLaunch from '@/pages/CrxsMainnetLaunch';
import CrixMoneyAdmin from '@/pages/CrixMoneyAdmin';
import QuickCoin from '@/pages/QuickCoin';
import BuyCrxs from '@/pages/BuyCrxs';
import CrxsMarket from '@/pages/CrxsMarket';
import CrxsDexLaunch from '@/pages/CrxsDexLaunch';

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