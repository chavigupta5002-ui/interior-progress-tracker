import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Navbar } from './components/Navbar'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Properties } from './pages/Properties'
import { PropertyDetail } from './pages/PropertyDetail'
import { PropertyScope } from './pages/PropertyScope'
import { PropertyUpdates } from './pages/PropertyUpdates'
import { Reports } from './pages/Reports'
import { Admin } from './pages/Admin'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50 font-poppins text-gray-900">
          <Navbar />
          <main className="mx-auto max-w-md p-4 pb-10 sm:p-6">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Properties />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/properties/:propertyId"
                element={
                  <ProtectedRoute>
                    <PropertyDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/properties/:propertyId/scope"
                element={
                  <ProtectedRoute>
                    <PropertyScope />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/properties/:propertyId/updates"
                element={
                  <ProtectedRoute>
                    <PropertyUpdates />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reports"
                element={
                  <ProtectedRoute>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
