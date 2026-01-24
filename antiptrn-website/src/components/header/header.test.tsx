import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Header } from "./header";
import { DesktopNav } from "./desktop-nav";
import { MobileMenu } from "./mobile-menu";
import { NavHoverIndicator } from "./nav-hover-indicator";
import { NAV_LINKS } from "./header.constants";

/** Wraps component in MemoryRouter for testing components that use useNavigate */
function withRouter(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("Header", () => {
  it("renders logo", () => {
    render(withRouter(<Header />));
    expect(screen.getByText("/ap")).toBeInTheDocument();
  });

  it("renders desktop navigation links", () => {
    render(withRouter(<Header />));
    NAV_LINKS.forEach((link) => {
      expect(screen.getByText(link.label)).toBeInTheDocument();
    });
  });

  it("renders log in button", () => {
    render(withRouter(<Header />));
    expect(screen.getByText("Log In")).toBeInTheDocument();
  });

  it("toggles mobile menu on button click", () => {
    render(withRouter(<Header />));
    const menuButton = screen.getByRole("button", { name: "" });

    expect(screen.queryByText("Get Started")).not.toBeInTheDocument();

    fireEvent.click(menuButton);
    expect(screen.getByText("Get Started")).toBeInTheDocument();

    fireEvent.click(menuButton);
    expect(screen.queryByText("Get Started")).not.toBeInTheDocument();
  });
});

describe("DesktopNav", () => {
  it("renders all navigation links", () => {
    render(withRouter(<DesktopNav />));
    NAV_LINKS.forEach((link) => {
      expect(screen.getByText(link.label)).toBeInTheDocument();
    });
  });

  it("renders badge for links with badge property", () => {
    render(withRouter(<DesktopNav />));
    const careersLink = NAV_LINKS.find((link) => link.badge);
    if (careersLink?.badge) {
      expect(screen.getByText(careersLink.badge)).toBeInTheDocument();
    }
  });
});

describe("MobileMenu", () => {
  it("renders all navigation links", () => {
    const onClose = vi.fn();
    render(<MobileMenu onClose={onClose} />);
    NAV_LINKS.forEach((link) => {
      expect(screen.getByText(link.label)).toBeInTheDocument();
    });
  });

  it("calls onClose when a link is clicked", () => {
    const onClose = vi.fn();
    render(<MobileMenu onClose={onClose} />);

    fireEvent.click(screen.getByText(NAV_LINKS[0].label));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders contact and get started buttons", () => {
    const onClose = vi.fn();
    render(<MobileMenu onClose={onClose} />);
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });
});

describe("NavHoverIndicator", () => {
  it("renders with correct position styles", () => {
    const { container } = render(
      <NavHoverIndicator hoverStyle={{ left: 100, width: 80 }} isVisible={true} />
    );
    const indicator = container.firstChild as HTMLElement;
    expect(indicator.style.left).toBe("100px");
    expect(indicator.style.width).toBe("80px");
  });

  it("has opacity-100 when visible", () => {
    const { container } = render(
      <NavHoverIndicator hoverStyle={{ left: 0, width: 0 }} isVisible={true} />
    );
    const indicator = container.firstChild as HTMLElement;
    expect(indicator.className).toContain("opacity-100");
  });

  it("has opacity-0 when not visible", () => {
    const { container } = render(
      <NavHoverIndicator hoverStyle={{ left: 0, width: 0 }} isVisible={false} />
    );
    const indicator = container.firstChild as HTMLElement;
    expect(indicator.className).toContain("opacity-0");
  });
});
