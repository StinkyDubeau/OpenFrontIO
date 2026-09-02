/**
 * Temporary customer-facing copy slots for the relay copywriter.
 *
 * Keep these deliberately literal. Product, legal, accessibility, live status,
 * and gameplay terminology are not placeholders and remain next to the code
 * that owns their meaning.
 */
export const placeholderCopy = {
  landing: {
    subtitle: "Game subtitle",
    identityLabel: "Player name",
    primaryAction: "Main menu",
    primaryActionDetail: "Primary action subtitle",
  },
  worlds: {
    eyebrow: "Page eyebrow",
    heading: "Page header",
    description: "Page description",
    primaryAction: "Primary action",
    primaryActionDetail: "Action description",
    playerListHeading: "Player world list",
    playerListEyebrow: "List eyebrow",
    playerListEmpty: "Player world empty-state message",
    publicListHeading: "Public world list",
    publicListEyebrow: "List eyebrow",
    publicListEmpty: "Public world empty-state message",
    pendingEyebrow: "Status eyebrow",
    pendingHeading: "Status header",
    pendingDescription: "Status explanation",
    finishedEyebrow: "Status eyebrow",
    finishedHeading: "Status header",
    finishedDescription: "Status explanation",
    membershipDescription: "Membership status description",
    invitationEyebrow: "Invitation eyebrow",
    invitationHeading: "Invitation header",
    identityEyebrow: "Identity eyebrow",
    identityHeading: "Identity header",
    identityDescription: "Identity instructions",
    identityPrivacy: "Identity privacy note",
    errorEyebrow: "Error eyebrow",
    errorDescription: "Error recovery instructions",
  },
  wizard: {
    eyebrow: "Wizard eyebrow",
    stepHeading: "Step header",
    stepInstructions: "Step instructions",
    optionDescription: "Option description",
    pacingDescription: "Pacing option description",
    pacingDisclosure: "Pacing disclaimer",
    scheduleDescription: "Schedule option description",
    reviewDisclosure: "Rules summary",
  },
  lobby: {
    rosterEyebrow: "Roster eyebrow",
    chatEyebrow: "Chat eyebrow",
    chatHint: "Chat hint",
    chatEmptyHeading: "Chat empty-state header",
    chatEmptyDescription: "Chat empty-state message",
    chatInstructions: "Chat instructions",
    reminderEyebrow: "Reminder eyebrow",
    reminderDescription: "Reminder instructions",
  },
} as const;
