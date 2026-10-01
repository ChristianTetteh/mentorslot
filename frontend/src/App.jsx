import { Routes, Route } from "react-router-dom";
import Header from "./components/Header.jsx";
import FieldList from "./pages/FieldList.jsx";
import MentorList from "./pages/MentorList.jsx";
import MentorSlots from "./pages/MentorSlots.jsx";
import MyBookings from "./pages/MyBookings.jsx";

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<FieldList />} />
          <Route path="/fields/:fieldId" element={<MentorList />} />
          <Route path="/mentors/:id" element={<MentorSlots />} />
          <Route path="/my-bookings" element={<MyBookings />} />
        </Routes>
      </main>
    </div>
  );
}
