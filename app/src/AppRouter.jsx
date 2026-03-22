import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Depositary from "./pages/Depositary";
import Investor from "./pages/Investor";
import Market from "./pages/Market";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/depositary" element={<Depositary />} />
      <Route path="/investor" element={<Investor />} />
      <Route path="/market" element={<Market />} />
    </Routes>
  );
}
