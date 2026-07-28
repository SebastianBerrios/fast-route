// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const { createTeamMember } = vi.hoisted(() => ({ createTeamMember: vi.fn() }));
vi.mock("@/features/admin/actions", () => ({ createTeamMember }));

import CreateMemberForm from "./CreateMemberForm";

function fill(values: { name?: string; email?: string; password?: string }) {
  if (values.name !== undefined)
    fireEvent.change(screen.getByLabelText("Nombre"), {
      target: { value: values.name },
    });
  if (values.email !== undefined)
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: values.email },
    });
  if (values.password !== undefined)
    fireEvent.change(screen.getByLabelText("Contraseña inicial"), {
      target: { value: values.password },
    });
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
}

beforeEach(() => {
  createTeamMember.mockReset();
  createTeamMember.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("CreateMemberForm", () => {
  it("sends what the admin typed, with the selected role", async () => {
    render(<CreateMemberForm />);
    fill({ name: "Ana Pérez", email: "ana@ejemplo.com", password: "secret123" });
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "seller" } });
    submit();

    await waitFor(() =>
      expect(createTeamMember).toHaveBeenCalledWith({
        fullName: "Ana Pérez",
        email: "ana@ejemplo.com",
        password: "secret123",
        role: "seller",
      }),
    );
  });

  it("defaults the role to driver, the most common hire", async () => {
    render(<CreateMemberForm />);
    fill({ name: "Ana", email: "ana@ejemplo.com", password: "secret123" });
    submit();

    await waitFor(() =>
      expect(createTeamMember).toHaveBeenCalledWith(
        expect.objectContaining({ role: "driver" }),
      ),
    );
  });

  it("masks the initial password until the admin asks to see it", () => {
    render(<CreateMemberForm />);
    const field = screen.getByLabelText("Contraseña inicial");

    // A real credential must not sit on screen by default...
    expect(field.getAttribute("type")).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    // ...but the admin has to read it back to hand it over.
    expect(field.getAttribute("type")).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(field.getAttribute("type")).toBe("password");
  });

  it("shows the server's message and keeps the input on failure", async () => {
    createTeamMember.mockResolvedValue({
      error: "Ese email ya tiene una cuenta y no puede agregarse desde acá.",
    });
    render(<CreateMemberForm />);
    fill({ name: "Ana", email: "ana@ejemplo.com", password: "secret123" });
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ya tiene una cuenta");
    // Losing the typed values would force the admin to retype everything to
    // change one character of the address.
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
      "ana@ejemplo.com",
    );
  });

  it("confirms success and clears the form for the next hire", async () => {
    render(<CreateMemberForm />);
    fill({ name: "Ana", email: "ana@ejemplo.com", password: "secret123" });
    submit();

    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Cuenta creada");
    await waitFor(() =>
      expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(""),
    );
  });

  it("does not leave a stale error next to a later success", async () => {
    createTeamMember.mockResolvedValue({ error: "Falló" });
    render(<CreateMemberForm />);
    fill({ name: "Ana", email: "ana@ejemplo.com", password: "secret123" });
    submit();
    await screen.findByRole("alert");

    createTeamMember.mockResolvedValue({ error: null });
    fill({ email: "ana2@ejemplo.com" });
    submit();

    await screen.findByRole("status");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tells the parent only after a real success", async () => {
    const onCreated = vi.fn();
    createTeamMember.mockResolvedValue({ error: "Falló" });
    render(<CreateMemberForm onCreated={onCreated} />);
    fill({ name: "Ana", email: "ana@ejemplo.com", password: "secret123" });
    submit();

    await screen.findByRole("alert");
    // Otherwise the onboarding wizard would tick "team" off on a failure.
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("surfaces a thrown action instead of hanging on 'Creando…'", async () => {
    createTeamMember.mockRejectedValue(new Error("network died"));
    render(<CreateMemberForm />);
    fill({ name: "Ana", email: "ana@ejemplo.com", password: "secret123" });
    submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo crear la cuenta");
  });
});
