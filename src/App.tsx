import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PrototypeNav } from './components/layout';
import { ToastContainer } from './components/common';
import { StartPage } from './pages/customer/StartPage';
import { SearchPage } from './pages/customer/SearchPage';
import { ResultsPage } from './pages/customer/ResultsPage';
import { PropertyPage } from './pages/customer/PropertyPage';
import { LiabilityPage } from './pages/customer/LiabilityPage';
import { ChallengePage } from './pages/customer/ChallengePage';
import { EvidencePage } from './pages/customer/EvidencePage';
import { ReviewPage } from './pages/customer/ReviewPage';
import { ConfirmationPage } from './pages/customer/ConfirmationPage';
import { DashboardPage } from './pages/caseworker/DashboardPage';
import { CaseDetailPage } from './pages/caseworker/CaseDetailPage';
import './styles/gds.css';
import './styles/components.css';

export default function App() {
  return (
    <BrowserRouter>
      <PrototypeNav />
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/property" element={<PropertyPage />} />
        <Route path="/liability" element={<LiabilityPage />} />
        <Route path="/challenge" element={<ChallengePage />} />
        <Route path="/evidence" element={<EvidencePage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/confirmation" element={<ConfirmationPage />} />
        <Route path="/caseworker" element={<DashboardPage />} />
        <Route path="/caseworker/case" element={<CaseDetailPage />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}
