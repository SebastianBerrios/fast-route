// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  within,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

const { revokeTeamMemberAccess, updateUserRole, updateUserPermissions } =
  vi.hoisted(() => ({
    revokeTeamMemberAccess: vi.fn(),
    updateUserRole: vi.fn(),
    updateUserPermissions: vi.fn(),
  }));
vi.mock("@/features/admin/actions", () => ({
  revokeTeamMemberAccess,
  updateUserRole,
  updateUserPermissions,
}));

import UsersTable, { type AdminUser } from "./UsersTable";

const ME: AdminUser = {
  id: "me-1",
  email: "owner@acme.test",
  full_name: "Owner",
  role: "admin",
  permissions: ["users.manage"],
};
const OTHER: AdminUser = {
  id: "them-2",
  email: "driver@acme.test",
  full_name: "A Driver",
  role: "driver",
  permissions: ["orders.deliver"],
};

/** The <li> for a given person, so assertions cannot drift onto another row. */
function row(name: string) {
  return screen.getByText(name).closest("li") as HTMLElement;
}

beforeEach(() => {
  [revokeTeamMemberAccess, updateUserRole, updateUserPermissions].forEach((m) =>
    m.mockReset(),
  );
  revokeTeamMemberAccess.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("UsersTable — revoking access", () => {
  it("offers no way to remove your own membership", () => {
    render(<UsersTable users={[ME, OTHER]} currentUserId={ME.id} />);

    // Self-removal is a lockout. The server refuses it and the RLS policy
    // refuses it; the UI should not present it as an option in the first place.
    expect(
      within(row("Owner")).queryByRole("button", { name: "Quitar acceso" }),
    ).toBeNull();
    expect(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    ).toBeTruthy();
  });

  it("asks for confirmation before doing anything", () => {
    render(<UsersTable users={[ME, OTHER]} currentUserId={ME.id} />);
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    );

    expect(revokeTeamMemberAccess).not.toHaveBeenCalled();
    expect(
      within(row("A Driver")).getByRole("button", { name: "Sí, quitar acceso" }),
    ).toBeTruthy();
  });

  it("warns that the email cannot be reused before the click, not after", () => {
    render(<UsersTable users={[ME, OTHER]} currentUserId={ME.id} />);
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    );

    // Revoking is one-way: createTeamMember refuses an email that already has
    // an account. An admin should learn that here, not afterwards.
    expect(row("A Driver").textContent).toContain(
      "no vas a poder volver a agregarla con este email",
    );
  });

  it("cancelling touches nothing", () => {
    render(<UsersTable users={[ME, OTHER]} currentUserId={ME.id} />);
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    );
    fireEvent.click(within(row("A Driver")).getByRole("button", { name: "Cancelar" }));

    expect(revokeTeamMemberAccess).not.toHaveBeenCalled();
    expect(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    ).toBeTruthy();
  });

  it("revokes the person whose row was clicked", async () => {
    render(<UsersTable users={[ME, OTHER]} currentUserId={ME.id} />);
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    );
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Sí, quitar acceso" }),
    );

    await waitFor(() =>
      expect(revokeTeamMemberAccess).toHaveBeenCalledWith(OTHER.id),
    );
    expect(revokeTeamMemberAccess).toHaveBeenCalledTimes(1);
  });

  it("surfaces a refusal and reopens the way back", async () => {
    revokeTeamMemberAccess.mockResolvedValue({
      error: "El negocio tiene que quedar con al menos un administrador.",
    });
    render(<UsersTable users={[ME, OTHER]} currentUserId={ME.id} />);
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    );
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Sí, quitar acceso" }),
    );

    const alert = await within(row("A Driver")).findByRole("alert");
    expect(alert.textContent).toContain("al menos un administrador");
    expect(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    ).toBeTruthy();
  });

  it("reports a thrown action instead of leaving the row stuck", async () => {
    revokeTeamMemberAccess.mockRejectedValue(new Error("network died"));
    render(<UsersTable users={[ME, OTHER]} currentUserId={ME.id} />);
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    );
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Sí, quitar acceso" }),
    );

    const alert = await within(row("A Driver")).findByRole("alert");
    expect(alert.textContent).toContain("No se pudo quitar el acceso");
  });

  it("keeps each row's confirmation to itself", () => {
    render(<UsersTable users={[ME, OTHER]} currentUserId="someone-else" />);
    fireEvent.click(
      within(row("A Driver")).getByRole("button", { name: "Quitar acceso" }),
    );

    // Row state is per-row; opening one must not arm a destructive button on
    // another person.
    expect(
      within(row("Owner")).queryByRole("button", { name: "Sí, quitar acceso" }),
    ).toBeNull();
  });
});
