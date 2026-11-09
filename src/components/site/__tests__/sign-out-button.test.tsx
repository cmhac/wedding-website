import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignOutButton } from "../SignOutButton";

function setup(signOut: () => Promise<unknown>) {
  const navigate = jest.fn();
  render(<SignOutButton client={{ signOut } as never} navigate={navigate} />);
  return { navigate };
}

describe("SignOutButton", () => {
  it("signs out once, then goes to the home page", async () => {
    const signOut = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const { navigate } = setup(signOut);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("is disabled while the request is in flight", async () => {
    let finish: (v: unknown) => void = () => {};
    const signOut = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    const { navigate } = setup(signOut);
    const button = screen.getByRole("button", { name: "Sign out" });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(signOut).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it("still goes to the home page when the request fails", async () => {
    const { navigate } = setup(jest.fn().mockRejectedValue(new Error("down")));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
  });
});
