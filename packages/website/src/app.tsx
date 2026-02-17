import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Outlet } from "react-router-dom";
import { NavigationScrollToTop } from "shared/navigation";

export function App() {
  return (
    <div className="min-h-screen bg-background">
      <NavigationScrollToTop />
      <Header />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default App;
