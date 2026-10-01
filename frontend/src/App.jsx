import { Routes, Route } from "react-router-dom";
import Header from "./components/Header.jsx";
import MentorList from "./pages/MentorList.jsx";
import MentorSlots from "./pages/MentorSlots.jsx";
import MyBookings from "./pages/MyBookings.jsx";

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<MentorList />} />
          <Route path="/mentors/:id" element={<MentorSlots />} />
          <Route path="/my-bookings" element={<MyBookings />} />
        </Routes>
      </main>
    </div>
  );
}
