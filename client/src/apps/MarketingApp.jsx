import { Route, Routes } from 'react-router-dom'
import MarketingLayout from '../pages/marketing/MarketingLayout'
import LandingPage from '../pages/marketing/LandingPage'
import SignupPage from '../pages/marketing/SignupPage'
import NotFoundPage from '../pages/NotFoundPage'

export default function MarketingApp() {
  return (
    <Routes>
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
