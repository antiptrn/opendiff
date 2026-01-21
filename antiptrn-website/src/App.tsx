import { Outlet } from "react-router-dom";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

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
