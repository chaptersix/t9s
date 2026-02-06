/**
 * Confirmation Modal - displays a confirmation dialog for dangerous actions
 */

import {
  BoxRenderable,
  TextRenderable,
  type BoxOptions,
  type RenderContext,
  t,
  dim,
  bold,
  red,
  yellow,
} from "@opentui/core";

export type ConfirmationType = "cancel" | "terminate" | "delete";

export interface ConfirmModalOptions extends BoxOptions {
  type: ConfirmationType;
  workflowId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const MODAL_CONTENT: Record<
  ConfirmationType,
  { title: string; message: string; confirmLabel: string; isDestructive: boolean }
> = {
  cancel: {
    title: "Cancel Workflow",
    message: "This will request graceful cancellation of the workflow.",
    confirmLabel: "Cancel Workflow",
    isDestructive: false,
  },
  terminate: {
    title: "Terminate Workflow",
    message: "This will immediately terminate the workflow. This action cannot be undone.",
    confirmLabel: "Terminate",
    isDestructive: true,
  },
  delete: {
    title: "Delete",
    message: "This will permanently delete the resource. This action cannot be undone.",
    confirmLabel: "Delete",
    isDestructive: true,
  },
};

export class ConfirmModal extends BoxRenderable {
  private onConfirmCallback: () => void;
  private onCancelCallback: () => void;
  private modalType: ConfirmationType;

  constructor(ctx: RenderContext, options: ConfirmModalOptions) {
    // Center the modal (position approximately in center)
    super(ctx, {
      ...options,
      id: options.id ?? "confirm-modal",
      position: "absolute",
      width: 50,
      height: 9,
      top: 10,
      left: 15,
      backgroundColor: "#1a1a2e",
      borderStyle: "rounded",
      borderColor: options.type === "terminate" || options.type === "delete" ? "#e74c3c" : "#f39c12",
      flexDirection: "column",
      padding: 1,
      zIndex: 100,
    });

    this.onConfirmCallback = options.onConfirm;
    this.onCancelCallback = options.onCancel;
    this.modalType = options.type;

    const content = MODAL_CONTENT[options.type];

    // Title
    const title = new TextRenderable(ctx, {
      id: "modal-title",
      width: "100%",
      height: 1,
    });
    title.content = content.isDestructive
      ? t`${red(bold(content.title))}`
      : t`${yellow(bold(content.title))}`;
    this.add(title);

    // Spacer
    const spacer1 = new BoxRenderable(ctx, { id: "spacer1", height: 1, width: "100%" });
    this.add(spacer1);

    // Workflow ID
    const workflowLine = new TextRenderable(ctx, {
      id: "modal-workflow",
      width: "100%",
      height: 1,
    });
    workflowLine.content = t`${dim("Workflow:")} ${options.workflowId}`;
    this.add(workflowLine);

    // Message
    const message = new TextRenderable(ctx, {
      id: "modal-message",
      width: "100%",
      height: 1,
    });
    message.content = t`${dim(content.message)}`;
    this.add(message);

    // Spacer
    const spacer2 = new BoxRenderable(ctx, { id: "spacer2", height: 1, width: "100%" });
    this.add(spacer2);

    // Actions hint
    const actions = new TextRenderable(ctx, {
      id: "modal-actions",
      width: "100%",
      height: 1,
    });
    actions.content = t`${dim("Press")} ${bold("y")} ${dim("to confirm,")} ${bold("n")} ${dim("or")} ${bold("Esc")} ${dim("to cancel")}`;
    this.add(actions);
  }

  handleKey(key: string): boolean {
    if (key === "y" || key === "Y") {
      this.onConfirmCallback();
      return true;
    }
    if (key === "n" || key === "N" || key === "Escape") {
      this.onCancelCallback();
      return true;
    }
    return false;
  }

  getType(): ConfirmationType {
    return this.modalType;
  }
}
