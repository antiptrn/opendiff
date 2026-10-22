import { ArrowDown01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, cn } from "components";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  NAVIGATION_ITEMS,
  type NavigationEntry,
  type NavigationItem,
  type NavigationMenuGroup,
  type NavigationMenuLink,
} from "./site-navigation.constants";

const NAVIGATION_LABELS = Object.keys(NAVIGATION_ITEMS) as NavigationItem[];

const NAVIGATION_SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;
const MENU_ID = "site-navigation-menu";
/** Grace period for moving the pointer between a trigger and the menu panel below the header */
const CLOSE_DELAY_MS = 120;

function isInternal(href: string) {
  return href.startsWith("/");
}

/** Plain text link; ones that open in a new tab get an arrow */
function MenuLink({ link, onSelect }: { link: NavigationMenuLink; onSelect: () => void }) {
  const className =
    "flex w-fit items-center gap-1.5 rounded-sm text-xl text-foreground outline-none transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground";

  if (isInternal(link.href)) {
    return (
      <Link to={link.href} className={className} onClick={onSelect}>
        {link.label}
      </Link>
    );
  }

  const isWeb = link.href.startsWith("http");
  return (
    <a
      href={link.href}
      target={isWeb ? "_blank" : undefined}
      rel={isWeb ? "noreferrer" : undefined}
      className={className}
      onClick={onSelect}
    >
      {link.label}
      {isWeb ? (
        <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-5" aria-hidden="true" />
      ) : null}
    </a>
  );
}

function MenuGroup({ group, onSelect }: { group: NavigationMenuGroup; onSelect: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-base text-muted-foreground">{group.label}</span>
      <ul className="flex flex-col gap-2">
        {group.links.map((link) => (
          <li key={link.label}>
            <MenuLink link={link} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Header navigation next to the logo. Hovering or focusing a trigger slides a highlight under it
 * and drops a full-width panel out of the header whose height springs to fit each menu, while
 * the page behind it blurs. `onOpenChange` lets the header turn solid while a menu is open.
 */
export function SiteNavigation({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [activeItem, setActiveItem] = useState<NavigationItem | null>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [panelHeight, setPanelHeight] = useState(0);
  const navigationRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const triggerRefs = useRef<Partial<Record<NavigationItem, HTMLButtonElement | null>>>({});

  const activeEntry: NavigationEntry | null = activeItem ? NAVIGATION_ITEMS[activeItem] : null;
  const activeMenu = activeEntry?.menu ?? null;

  const measureTrigger = useCallback((item: NavigationItem) => {
    const navigation = navigationRef.current;
    const trigger = triggerRefs.current[item];
    if (!navigation || !trigger) return;

    const navigationRect = navigation.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    setIndicator({
      left: triggerRect.left - navigationRect.left,
      top: triggerRect.top - navigationRect.top,
      width: triggerRect.width,
      height: triggerRect.height,
    });
  }, []);

  const cancelClose = useCallback(() => window.clearTimeout(closeTimer.current), []);

  const close = useCallback(() => {
    cancelClose();
    setActiveItem(null);
  }, [cancelClose]);

  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setActiveItem(null), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const openMenu = useCallback(
    (item: NavigationItem) => {
      cancelClose();
      measureTrigger(item);
      setActiveItem(item);
    },
    [cancelClose, measureTrigger]
  );

  useEffect(() => cancelClose, [cancelClose]);

  useEffect(() => {
    onOpenChange?.(activeMenu !== null);
  }, [activeMenu, onOpenChange]);

  // Keep the highlight aligned when the layout or window changes
  useEffect(() => {
    if (!activeItem) return;

    const update = () => measureTrigger(activeItem);
    update();
    const observer = new ResizeObserver(update);
    if (navigationRef.current) observer.observe(navigationRef.current);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activeItem, measureTrigger]);

  // Size the panel to the active menu so its height can animate between menus
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!activeMenu || !content) return;

    const measure = () => setPanelHeight(content.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);

    return () => observer.disconnect();
  }, [activeMenu]);

  const movement = reduceMotion ? { duration: 0 } : NAVIGATION_SPRING;
  const fadeIn = reduceMotion ? { duration: 0 } : { duration: 0.14 };
  const fadeOut = reduceMotion ? { duration: 0 } : { duration: 0.12 };
  const backdropFade = reduceMotion ? { duration: 0 } : { duration: 0.2 };

  return (
    <nav
      aria-label="Site sections"
      className="ml-6 hidden items-center md:flex"
      onPointerLeave={closeSoon}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div ref={navigationRef} className="relative flex items-center gap-1">
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 rounded-md bg-muted"
          initial={false}
          animate={{
            opacity: activeItem && indicator ? 1 : 0,
            x: indicator?.left ?? 0,
            y: indicator?.top ?? 0,
            width: indicator?.width ?? 0,
            height: indicator?.height ?? 0,
          }}
          transition={{
            x: movement,
            y: movement,
            width: movement,
            height: movement,
            opacity: fadeIn,
          }}
        />

        {NAVIGATION_LABELS.map((item) => {
          const entry: NavigationEntry = NAVIGATION_ITEMS[item];
          const isActive = activeItem === item;

          return (
            <Button
              key={item}
              ref={(element) => {
                triggerRefs.current[item] = element;
              }}
              type="button"
              variant="ghost"
              className={cn(
                "relative z-10 gap-1 text-foreground hover:bg-transparent aria-expanded:bg-transparent dark:hover:bg-transparent",
                // The chevron's box has empty space on both sides, so trim the padding after it
                entry.menu && "pr-2.5"
              )}
              aria-controls={entry.menu ? MENU_ID : undefined}
              aria-expanded={entry.menu ? isActive : undefined}
              onClick={() => {
                if (!entry.href) return;
                close();
                if (isInternal(entry.href)) navigate(entry.href);
                else window.location.assign(entry.href);
              }}
              onFocus={() => openMenu(item)}
              onPointerEnter={() => openMenu(item)}
            >
              {item}
              {entry.menu ? (
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  aria-hidden="true"
                  className={cn("transition-transform duration-200", isActive && "rotate-180")}
                />
              ) : null}
            </Button>
          );
        })}
      </div>

      {/* Positioned against the fixed header, so it spans the full width just below it */}
      <AnimatePresence>
        {activeMenu ? (
          <motion.div
            key={MENU_ID}
            id={MENU_ID}
            className="absolute inset-x-0 top-full overflow-hidden bg-background shadow-xl shadow-black/5"
            initial={{ height: 0 }}
            animate={{ height: panelHeight }}
            exit={{ height: 0 }}
            transition={{ height: movement }}
            onPointerEnter={cancelClose}
          >
            <div className="relative mx-auto w-full max-w-7xl">
              <AnimatePresence initial={false}>
                <motion.div
                  key={activeItem}
                  ref={(element) => {
                    // The exiting menu would clear the ref on unmount, so only ever set it
                    if (element) contentRef.current = element;
                  }}
                  className="absolute inset-x-0 top-0 grid grid-cols-4 gap-x-8 px-4 pt-2 pb-10 md:px-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: fadeIn }}
                  exit={{ opacity: 0, transition: fadeOut }}
                >
                  {activeMenu.map((group) => (
                    <MenuGroup key={group.label} group={group} onSelect={close} />
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Blurs the page behind the open menu; the header stays above it */}
      {createPortal(
        <AnimatePresence>
          {activeMenu ? (
            <motion.div
              key="site-navigation-backdrop"
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 z-40 bg-background/30 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={backdropFade}
            />
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </nav>
  );
}
