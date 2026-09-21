import Link from "next/link";
import { MixFavoriteButton } from "@/components/MixFavoriteButton";
import { AppIcon } from "@/components/AppIcon";

export function MixLibraryNav({ mixes, selected, href, showTabs = true, canEdit = true }: {
  mixes: { id: string; name: string; status: string; people?: number; favorite?: boolean; steps?: { dayOffset: number; anchor: string }[] }[];
  selected?: string;
  href?: (id: string) => string;
  showTabs?: boolean; canEdit?: boolean;
}) {
  return <nav className="mix-library-nav" aria-label="Your Mix library">
    {showTabs && <div className="mix-library-tabs"><Link href="/mixes" aria-current="page"><AppIcon name="mixes" />My mixes</Link><Link href="/templates"><AppIcon name="import" />Ready-made</Link></div>}
    {mixes.map(mix => <div className="mix-library-row" key={mix.id}><Link className="mix-library-item" href={href ? href(mix.id) : `/mixes/${mix.id}/edit`} aria-current={selected === mix.id ? "page" : undefined}>
      <strong>{mix.name}</strong><span>{mix.people !== undefined ? `${mix.people} ${mix.people === 1 ? "person" : "people"}` : mix.status.toLowerCase()}{mix.status !== "ACTIVE" && mix.people !== undefined ? ` · ${mix.status.toLowerCase()}` : ""}</span>
      {mix.steps && <><span className="mix-library-rhythm" aria-hidden="true">{mix.steps.map((step, index) => <i key={index} data-appointment={step.anchor !== "CALENDAR_DAY" || undefined} />)}</span><small>{mix.steps.length} {mix.steps.length === 1 ? "beat" : "beats"}{mix.steps.some(step => step.anchor !== "CALENDAR_DAY") ? " · includes visit timing" : ` · through day ${Math.max(0, ...mix.steps.map(step => step.dayOffset))}`}</small></>}
    </Link>{mix.favorite !== undefined && <MixFavoriteButton target={{ kind: "mix", id: mix.id }} name={mix.name} initial={mix.favorite} canEdit={canEdit} />}</div>)}
  </nav>;
}
