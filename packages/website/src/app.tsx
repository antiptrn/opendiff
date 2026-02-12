import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Outlet } from "react-router-dom";

export function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default App;
