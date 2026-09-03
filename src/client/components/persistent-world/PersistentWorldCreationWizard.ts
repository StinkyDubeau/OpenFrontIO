import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type {
  CreatePersistentWorldRequest,
  PersistentWorldAccess,
  PersistentWorldDuration,
  PersistentWorldMode,
} from "../../../core/PersistentWorldSchemas";
import { placeholderCopy } from "../../copy/PlaceholderCopy";
import {
  formatWorldDate,
  formatWorldDuration,
} from "./PersistentWorldComponents";

interface SchedulePreset {
  id: string;
  label: string;
  description: string;
  value: () => number;
}

const startOfTomorrowEvening = (): number => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(19, 0, 0, 0);
  return date.getTime();
};

const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    id: "soon",
    label: "In 10 minutes",
    description: placeholderCopy.wizard.scheduleDescription,
    value: () => Date.now() + 10 * 60 * 1000,
  },
  {
    id: "hour",
    label: "In one hour",
    description: placeholderCopy.wizard.scheduleDescription,
    value: () => Date.now() + 60 * 60 * 1000,
  },
  {
    id: "tomorrow",
    label: "Tomorrow evening",
    description: placeholderCopy.wizard.scheduleDescription,
    value: startOfTomorrowEvening,
  },
  {
    id: "week",
    label: "In one week",
    description: placeholderCopy.wizard.scheduleDescription,
    value: () => Date.now() + 7 * 24 * 60 * 60 * 1000,
  },
];

@customElement("persistent-world-creation-wizard")
export class PersistentWorldCreationWizard extends LitElement {
  @property({ type: Boolean }) submitting = false;
  @property() error = "";
  @state() private step = 0;
  @state() private name: string = placeholderCopy.wizard.worldNameDefault;
  @state() private duration: PersistentWorldDuration = "1d";
  @state() private access: PersistentWorldAccess = "private";
  @state() private mode: PersistentWorldMode = "ffa";
  @state() private maxHumans = 8;
  @state() private teamId = "team-1";
  @state() private schedulePreset = "tomorrow";
  @state() private startsAt = startOfTomorrowEvening();
  @state() private exactSchedule = false;

  createRenderRoot() {
    return this;
  }

  render() {
    const stepNames = placeholderCopy.wizard.stepTitles;
    return html`
      <section class="pw-wizard" aria-labelledby="pw-wizard-title">
        <header class="pw-wizard__header">
          <button
            class="pw-icon-button"
            type="button"
            aria-label="Close world setup"
            @click=${this.close}
          >
            ×
          </button>
          <div>
            <span class="pw-eyebrow" data-copy-slot="wizard.eyebrow"
              >${placeholderCopy.wizard.eyebrow}</span
            >
            <h1 id="pw-wizard-title">${stepNames[this.step]}</h1>
          </div>
          <span class="pw-wizard__position"
            >${this.step + 1} of ${stepNames.length}</span
          >
        </header>

        <ol class="pw-wizard__progress" aria-label="Setup progress">
          ${stepNames.map(
            (label, index) => html`
              <li
                class=${
                  index === this.step
                    ? "is-current"
                    : index < this.step
                      ? "is-complete"
                      : ""
                }
              >
                <button
                  class="pw-wizard__step"
                  type="button"
                  aria-label=${`Go to ${label} step`}
                  aria-current=${index === this.step ? "step" : nothing}
                  ?disabled=${!this.canOpenStep(index)}
                  @click=${() => this.openStep(index)}
                >
                  <span>${index < this.step ? "✓" : index + 1}</span
                  ><small>${label}</small>
                </button>
              </li>
            `,
          )}
        </ol>

        <div class="pw-wizard__viewport">
          ${
            this.step === 0
              ? this.renderWorldStep()
              : this.step === 1
                ? this.renderPlayersStep()
                : this.step === 2
                  ? this.renderScheduleStep()
                  : this.renderInvitationStep()
          }
        </div>

        ${
          this.error
            ? html`<div class="pw-alert" role="alert">${this.error}</div>`
            : nothing
        }

        <footer class="pw-wizard__footer">
          <button
            class="pw-button pw-button--secondary"
            type="button"
            @click=${this.back}
            ?disabled=${this.submitting}
          >
            ${this.step === 0 ? "Cancel" : "Back"}
          </button>
          <button
            class="pw-button pw-button--primary"
            type="button"
            @click=${this.next}
            ?disabled=${this.submitting || !this.canContinue()}
          >
            ${
              this.submitting
                ? "Preparing invitation…"
                : this.step === 3
                  ? "Create invitation"
                  : "Continue"
            }
          </button>
        </footer>
      </section>
    `;
  }

  private renderWorldStep() {
    return html`
      <div class="pw-wizard-step pw-wizard-step--world">
        <div class="pw-wizard-step__intro">
          <span class="pw-step-number">01</span>
          <div>
            <h2 data-copy-slot="wizard.stepHeadings.0">
              ${placeholderCopy.wizard.stepHeadings[0]}
            </h2>
            <p data-copy-slot="wizard.stepInstructions.0">
              ${placeholderCopy.wizard.stepInstructions[0]}
            </p>
          </div>
        </div>
        <label class="pw-field">
          <span data-copy-slot="wizard.worldNameLabel"
            >${placeholderCopy.wizard.worldNameLabel}</span
          >
          <input
            type="text"
            maxlength="100"
            autocomplete="off"
            .value=${this.name}
            @input=${(event: Event) =>
              (this.name = (event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <fieldset class="pw-choice-grid pw-choice-grid--three">
          <legend data-copy-slot="wizard.pacingLabel">
            ${placeholderCopy.wizard.pacingLabel}
          </legend>
          ${(["1h", "1d", "7d"] as const).map(
            (duration) => html`
              <label
                class="pw-choice-card ${
                  this.duration === duration ? "is-selected" : ""
                }"
              >
                <input
                  type="radio"
                  name="duration"
                  value=${duration}
                  .checked=${this.duration === duration}
                  @change=${() => (this.duration = duration)}
                />
                <span class="pw-choice-card__icon" aria-hidden="true"
                  >${
                    duration === "1h" ? "◷" : duration === "1d" ? "◑" : "✦"
                  }</span
                >
                <strong>${formatWorldDuration(duration)}</strong>
                <small
                  data-copy-slot=${`wizard.pacingDescriptions.${duration}`}
                  >${placeholderCopy.wizard.pacingDescriptions[duration]}</small
                >
              </label>
            `,
          )}
        </fieldset>
        <p class="pw-disclosure" data-copy-slot="wizard.pacingDisclosure">
          ${placeholderCopy.wizard.pacingDisclosure}
        </p>
      </div>
    `;
  }

  private renderPlayersStep() {
    return html`
      <div class="pw-wizard-step">
        <div class="pw-wizard-step__intro">
          <span class="pw-step-number">02</span>
          <div>
            <h2 data-copy-slot="wizard.stepHeadings.1">
              ${placeholderCopy.wizard.stepHeadings[1]}
            </h2>
            <p data-copy-slot="wizard.stepInstructions.1">
              ${placeholderCopy.wizard.stepInstructions[1]}
            </p>
          </div>
        </div>
        <div class="pw-settings-row">
          <fieldset class="pw-choice-grid">
            <legend>Visibility</legend>
            ${this.binaryChoices(
              [
                [
                  "private",
                  "Private",
                  placeholderCopy.wizard.privateDescription,
                ],
                ["public", "Public", placeholderCopy.wizard.publicDescription],
              ],
              this.access,
              (value) => (this.access = value as PersistentWorldAccess),
              "access",
            )}
          </fieldset>
          <fieldset class="pw-choice-grid">
            <legend>Diplomacy</legend>
            ${this.binaryChoices(
              [
                [
                  "ffa",
                  "Free for all",
                  placeholderCopy.wizard.freeForAllDescription,
                ],
                ["teams", "Teams", placeholderCopy.wizard.teamsDescription],
              ],
              this.mode,
              (value) => (this.mode = value as PersistentWorldMode),
              "mode",
            )}
          </fieldset>
        </div>
        <div class="pw-stepper-field">
          <div>
            <span data-copy-slot="wizard.playerCountLabel"
              >${placeholderCopy.wizard.playerCountLabel}</span
            ><small data-copy-slot="wizard.playerCountDescription"
              >${placeholderCopy.wizard.playerCountDescription}</small
            >
          </div>
          <div class="pw-stepper">
            <button
              type="button"
              aria-label="Remove one commander"
              @click=${() => (this.maxHumans = Math.max(2, this.maxHumans - 1))}
            >
              −
            </button>
            <output>${this.maxHumans}</output>
            <button
              type="button"
              aria-label="Add one commander"
              @click=${() =>
                (this.maxHumans = Math.min(16, this.maxHumans + 1))}
            >
              +
            </button>
          </div>
        </div>
        ${
          this.mode === "teams"
            ? html`<label class="pw-field pw-field--compact"
                ><span>Your team</span>
                <select
                  .value=${this.teamId}
                  @change=${(event: Event) =>
                    (this.teamId = (
                      event.currentTarget as HTMLSelectElement
                    ).value)}
                >
                  <option value="team-1">Team 1</option>
                  <option value="team-2">Team 2</option>
                  <option value="team-3">Team 3</option>
                  <option value="team-4">Team 4</option>
                </select></label
              >`
            : nothing
        }
      </div>
    `;
  }

  private renderScheduleStep() {
    return html`
      <div class="pw-wizard-step">
        <div class="pw-wizard-step__intro">
          <span class="pw-step-number">03</span>
          <div>
            <h2 data-copy-slot="wizard.stepHeadings.2">
              ${placeholderCopy.wizard.stepHeadings[2]}
            </h2>
            <p data-copy-slot="wizard.stepInstructions.2">
              ${placeholderCopy.wizard.stepInstructions[2]}
            </p>
          </div>
        </div>
        <div class="pw-schedule-grid">
          ${SCHEDULE_PRESETS.map(
            (preset) => html`
              <button
                type="button"
                class="pw-schedule-card ${
                  !this.exactSchedule && this.schedulePreset === preset.id
                    ? "is-selected"
                    : ""
                }"
                @click=${() => this.selectPreset(preset)}
              >
                <strong>${preset.label}</strong
                ><small>${preset.description}</small>
              </button>
            `,
          )}
          <button
            type="button"
            class="pw-schedule-card ${this.exactSchedule ? "is-selected" : ""}"
            @click=${() => (this.exactSchedule = true)}
          >
            <strong>Exact date & time</strong
            ><small data-copy-slot="wizard.scheduleDescription"
              >${placeholderCopy.wizard.scheduleDescription}</small
            >
          </button>
        </div>
        ${
          this.exactSchedule
            ? html`<label class="pw-field"
                ><span>Local start time</span
                ><input
                  type="datetime-local"
                  .value=${this.toDateTimeLocal(this.startsAt)}
                  min=${this.toDateTimeLocal(Date.now() + 2 * 60 * 1000)}
                  max=${this.toDateTimeLocal(
                    Date.now() + 14 * 24 * 60 * 60 * 1000,
                  )}
                  @change=${this.updateExactTime}
              /></label>`
            : nothing
        }
        <div class="pw-schedule-confirmation">
          <span>Automatic launch</span
          ><strong>${formatWorldDate(this.startsAt)}</strong
          ><small>${Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
        </div>
      </div>
    `;
  }

  private renderInvitationStep() {
    return html`
      <div class="pw-wizard-step pw-wizard-step--review">
        <div class="pw-review-seal" aria-hidden="true"><span>IV</span></div>
        <div class="pw-wizard-step__intro pw-wizard-step__intro--centered">
          <div>
            <h2 data-copy-slot="wizard.stepHeadings.3">
              ${placeholderCopy.wizard.stepHeadings[3]}
            </h2>
            <p data-copy-slot="wizard.stepInstructions.3">
              ${placeholderCopy.wizard.stepInstructions[3]}
            </p>
          </div>
        </div>
        <dl class="pw-review-grid">
          <div>
            <dt>World</dt>
            <dd>${this.name.trim()}</dd>
          </div>
          <div>
            <dt>Starts</dt>
            <dd>${formatWorldDate(this.startsAt)}</dd>
          </div>
          <div>
            <dt>Pace</dt>
            <dd>${formatWorldDuration(this.duration)}</dd>
          </div>
          <div>
            <dt>Seats</dt>
            <dd>${this.maxHumans} humans</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>
              ${
                this.access === "private" ? "Invitation only" : "Public listing"
              }
            </dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>
              ${this.mode === "ffa" ? "Free for all" : "Player-chosen teams"}
            </dd>
          </div>
        </dl>
        <div
          class="pw-disclosure pw-disclosure--emphasis"
          data-copy-slot="wizard.reviewDisclosure"
        >
          ${placeholderCopy.wizard.reviewDisclosure}
        </div>
      </div>
    `;
  }

  private binaryChoices(
    choices: [string, string, string][],
    current: string,
    update: (value: string) => void,
    name: string,
  ) {
    return choices.map(
      ([value, label, detail]) => html`
        <label
          class="pw-choice-card pw-choice-card--horizontal ${
            current === value ? "is-selected" : ""
          }"
        >
          <input
            type="radio"
            name=${name}
            value=${value}
            .checked=${current === value}
            @change=${() => update(value)}
          />
          <span><strong>${label}</strong><small>${detail}</small></span>
        </label>
      `,
    );
  }

  private selectPreset(preset: SchedulePreset) {
    this.exactSchedule = false;
    this.schedulePreset = preset.id;
    this.startsAt = preset.value();
  }

  private updateExactTime = (event: Event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) this.startsAt = timestamp;
  };

  private toDateTimeLocal(timestamp: number): string {
    const date = new Date(
      timestamp - new Date(timestamp).getTimezoneOffset() * 60_000,
    );
    return date.toISOString().slice(0, 16);
  }

  private canContinue(): boolean {
    if (this.step === 0) return this.name.trim().length > 0;
    if (this.step === 2) return this.hasValidSchedule();
    return true;
  }

  private hasValidSchedule(): boolean {
    return (
      this.startsAt >= Date.now() + 60_000 &&
      this.startsAt <= Date.now() + 14 * 24 * 60 * 60 * 1000
    );
  }

  private canOpenStep(index: number): boolean {
    if (this.submitting) return false;
    if (index <= this.step) return true;
    if (index > 0 && this.name.trim().length === 0) return false;
    if (index > 2 && !this.hasValidSchedule()) return false;
    return true;
  }

  private openStep(index: number) {
    if (!this.canOpenStep(index)) return;
    this.error = "";
    this.step = index;
  }

  private next = () => {
    if (!this.canContinue()) return;
    if (this.step < 3) {
      this.step += 1;
      return;
    }
    const input: CreatePersistentWorldRequest = {
      name: this.name.trim(),
      targetDuration: this.duration,
      access: this.access,
      mode: this.mode,
      maxHumans: this.maxHumans,
      startsAt: this.startsAt,
      teamId: this.mode === "teams" ? this.teamId : null,
    };
    this.dispatchEvent(
      new CustomEvent("world-create", {
        detail: { input },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private back = () => {
    if (this.step === 0) return this.close();
    this.step -= 1;
  };

  private close = () => {
    this.dispatchEvent(
      new CustomEvent("world-wizard-close", { bubbles: true, composed: true }),
    );
  };
}
