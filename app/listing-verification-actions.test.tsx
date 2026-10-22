import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailDisclosure } from "@/components/deal/DetailDisclosure";
import {
  ListingVerification,
  type VerificationSection,
} from "@/components/deal/ListingVerification";

let host: HTMLDivElement, root: Root;
const mount = vi.fn();
const originalScroll = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);
const sections: VerificationSection[] = ["condition", "market", "plan"];
function Tool({ section }: { section: VerificationSection }) {
  React.useEffect(() => {
    mount(section);
  }, [section]);
  return <p>{section} tool content</p>;
}
function Workspace() {
  const [request, setRequest] = React.useState({ section: "", count: 0 });
  return (
    <>
      <ListingVerification
        present={[]}
        missing={[]}
        onOpenSection={(section) =>
          setRequest((current) => ({ section, count: current.count + 1 }))
        }
      />
      {sections.map((section) => (
        <DetailDisclosure
          key={section}
          eyebrow={section}
          title={`${section} tools`}
          summary={`Review ${section}`}
          request={request.section === section ? request.count : 0}
        >
          <Tool section={section} />
        </DetailDisclosure>
      ))}
    </>
  );
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mount.mockClear();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Workspace />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  if (originalScroll)
    Object.defineProperty(Element.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
});
describe("listing verification navigation", () => {
  it("keeps all deeper tools unmounted until requested", () => {
    expect(mount).not.toHaveBeenCalled();
    expect(host.querySelectorAll("details[open]")).toHaveLength(0);
  });
  it.each([
    ["Check title and condition", "condition"],
    ["Compare market evidence", "market"],
    ["Contact seller and keep notes", "plan"],
  ])(
    "opens and focuses only the requested tool via %s and reopens after closing",
    async (label, section) => {
      const button = Array.from(host.querySelectorAll("button")).find(
        (el) => el.textContent === label,
      )!;
      await act(async () => button.click());
      expect(mount).toHaveBeenCalledExactlyOnceWith(section);
      const disclosure = Array.from(host.querySelectorAll("details")).find(
        (el) => el.querySelector("h2")?.textContent === `${section} tools`,
      )!;
      expect(disclosure.open).toBe(true);
      expect(document.activeElement).toBe(disclosure.querySelector("summary"));
      expect(host.querySelectorAll("details[open]")).toHaveLength(1);
      await act(async () => {
        disclosure.open = false;
        disclosure.dispatchEvent(new Event("toggle"));
      });
      expect(disclosure.textContent).not.toContain(`${section} tool content`);
      await act(async () => button.click());
      expect(disclosure.open).toBe(true);
      expect(document.activeElement).toBe(disclosure.querySelector("summary"));
      expect(mount).toHaveBeenCalledTimes(2);
    },
  );
});
