import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { PhoneMenu } from "@/components/PhoneMenu";

const COLLECTIONS = [
  { key: "mixes", href: "/mixes", icon: "mixes", label: "My Mixes" },
  { key: "mega", href: "/mixes/mega", icon: "journey", label: "Mega-Mixes" },
  { key: "marketplace", href: "/marketplace", icon: "store", label: "Marketplace" }
] as const satisfies ReadonlyArray<{ key: string; href: string; icon: AppIconName; label: string }>;

/**
 * The Mix library's three collection tabs (JITM-07 §2.18). On phones they fold into one selector under the
 * Mixes / Beats / Details switcher, so the pane shows one tab bar (audit P-07).
 */
export function MixCollectionTabs({ current }: { current: (typeof COLLECTIONS)[number]["key"] }) {
  const active = COLLECTIONS.find(item => item.key === current)!;
  return <nav className="mix-library-tabs" aria-label="Mix collection">
    <PhoneMenu className="mix-collection-menu" button={<><AppIcon name={active.icon} /><span>{active.label}</span><AppIcon name="chevronDown" /></>}>
      {COLLECTIONS.map(item => <Link key={item.key} href={item.href} aria-current={item.key === current ? "page" : undefined}><AppIcon name={item.icon} />{item.label}</Link>)}
    </PhoneMenu>
  </nav>;
}
