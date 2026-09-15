import { Routes, Route } from 'react-router-dom'
import TopBar from './components/TopBar'
import TabBar from './components/TabBar'
import Landing from './pages/Landing'
import Home from './pages/Home'
import MapPage from './pages/MapPage'
import RoutesPage from './pages/RoutesPage'
import Gems from './pages/Gems'
import Profile from './pages/Profile'
import './App.css'

function AppShell() {
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/gems" element={<Gems />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app/*" element={<AppShell />} />
    </Routes>
  )
}

export default App