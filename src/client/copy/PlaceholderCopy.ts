/**
 * Temporary customer-facing copy slots for the relay copywriter.
 *
 * Keep these deliberately literal. Product, legal, accessibility, live status,
 * and gameplay terminology are not placeholders and remain next to the code
 * that owns their meaning.
 */
export const placeholderCopy = {
  landing: {
    subtitle: "online world domination",
    identityLabel: "Enter a username",
    primaryAction: "Choose a match",
    primaryActionDetail: "Primary action subtitle",
  },
  worlds: {
    eyebrow: "choose a lobby",
    heading: "welcome to idlefront",
    description: "join a public game or create a new world",
    primaryAction: "Start a world",
    primaryActionDetail:
      "Create a match to invite friends, or open to the public",
    playerListHeading: "Your matches",
    playerListEyebrow: "continue",
    playerListEmpty: "You don't have any matches.",
    publicListHeading: "Public lobbies",
    publicListEyebrow: "join",
    publicListEmpty: "There are no worlds in the world!",
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
    eyebrow: "lobby creator",
    stepTitles: [
      "Choose your options",
      "Choose your fighters",
      "Start",
      "Invitation",
    ],
    stepHeadings: ["Duration", "Players", "Step header", "Step header"],
    stepInstructions: [
      "sets the pace and scale of the world.",
      "who can join the game",
      "Step instructions",
      "Step instructions",
    ],
    worldNameLabel: "the name of your lobby",
    worldNameDefault: "World name",
    pacingLabel: "game speed",
    privateDescription: "Send invitations to join",
    publicDescription: "Allow everyone to join",
    freeForAllDescription: "Make & break alliances here",
    teamsDescription: "Live or die with your side",
    playerCountLabel: "player slots",
    playerCountDescription: "unfilled slots will be filled with AI nations",
    pacingDescriptions: {
      "1h": "A realtime game",
      "1d": "Check-in on a 6~14 hour match",
      "7d": "Longterm worldbuilding",
    },
    pacingDisclosure:
      "Game speed is not guaranteed. Different strategies drastically impact game length.",
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
