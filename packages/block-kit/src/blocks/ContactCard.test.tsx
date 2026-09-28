import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlockKitProvider } from "../context";
import { ContactCard } from "./ContactCard";

afterEach(cleanup);

describe("<ContactCard>", () => {
  it("shows an unknown-user skeleton when there is no resolver", () => {
    const block = { type: "contact_card", contact_user_id: "U0123456789" };
    const { container } = render(<ContactCard block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-contact-card__name--unknown")).toBeTruthy();
    expect(container.querySelector(".sbk-contact-card__skeleton")).toBeTruthy();
    expect(screen.getByText("Contact")).toBeTruthy();
  });

  it("shows the resolved display name when resolvers.user finds one", () => {
    const block = { type: "contact_card", contact_user_id: "U123" };
    render(
      <BlockKitProvider resolvers={{ user: (id) => (id === "U123" ? "Ada Lovelace" : undefined) }}>
        <ContactCard block={block as never} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.queryByText("Contact")).toBeTruthy();
  });

  it("falls back to the skeleton when the resolver returns undefined for this id", () => {
    const block = { type: "contact_card", contact_user_id: "U999" };
    const { container } = render(
      <BlockKitProvider resolvers={{ user: (id) => (id === "U123" ? "Ada Lovelace" : undefined) }}>
        <ContactCard block={block as never} blockId="b1" index={0} />
      </BlockKitProvider>,
    );
    expect(container.querySelector(".sbk-contact-card__name--unknown")).toBeTruthy();
  });
});
