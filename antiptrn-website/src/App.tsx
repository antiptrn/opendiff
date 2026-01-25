import { Outlet } from "react-router-dom";
import { Footer, Header } from "@shared/components/layout";

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
