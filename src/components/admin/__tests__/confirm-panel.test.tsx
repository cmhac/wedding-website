import { render, screen, within } from "@testing-library/react";
import { ConfirmPanel } from "../ConfirmPanel";

const action = jest.fn();

function renderPanel(extra: Partial<Parameters<typeof ConfirmPanel>[0]> = {}) {
  return render(
    <ConfirmPanel
      heading="Delete The Examples?"
      consequence="This deletes the household and all its answers. It cannot be undone."
      action={action}
      confirmLabel="Delete permanently"
      cancelHref="/admin/households/abc?tab=details"
      {...extra}
    />,
  );
}

describe("ConfirmPanel", () => {
  it("is an alertdialog named by its heading, with the consequence", () => {
    renderPanel();
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete The Examples?",
    });
    expect(
      within(dialog).getByRole("heading", { name: "Delete The Examples?" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it("submits the destructive action from a form", () => {
    renderPanel();
    const button = screen.getByRole("button", { name: "Delete permanently" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("btn-danger");
    expect(button.closest("form")).not.toBeNull();
  });

  it("cancels with a link back to the page without the confirm value", () => {
    renderPanel();
    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/admin/households/abc?tab=details");
    expect(cancel.getAttribute("href")).not.toContain("confirm");
  });

  it("carries hidden fields in the form", () => {
    const { container } = renderPanel({ hiddenFields: { id: "abc" } });
    const input = container.querySelector('input[type="hidden"][name="id"]');
    expect(input).toHaveValue("abc");
  });

  it("has no typing input unless asked", () => {
    renderPanel();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("asks for the name to be typed: required and labelled", () => {
    renderPanel({
      typeToConfirm: { label: "Type the household name to confirm" },
    });
    const input = screen.getByLabelText("Type the household name to confirm");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("name", "confirmation");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input.closest("form")).toBe(
      screen
        .getByRole("button", { name: "Delete permanently" })
        .closest("form"),
    );
  });
});
