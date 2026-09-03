import { ClientEnv } from "./ClientEnv";

export const sourceRepositoryUrl =
  "https://github.com/StinkyDubeau/OpenFrontIO";
const configuredDevelopmentSourceRef = import.meta.env.VITE_SOURCE_REF?.trim();
const developmentSourceRef = configuredDevelopmentSourceRef?.length
  ? configuredDevelopmentSourceRef
  : "experimental/massive-world-demo";

function deployedSourceRef(): string {
  try {
    const commit = ClientEnv.gitCommit().trim();
    if (/^[0-9a-f]{7,40}$/i.test(commit)) return commit;
  } catch {
    // Static previews may render before BOOTSTRAP_CONFIG exists.
  }
  // The password-gated Vite preview is still network use under AGPL §13.
  // Until a server injects an immutable commit, link to this published branch
  // rather than incorrectly claiming that `main` is the running source.
  return import.meta.env.DEV ? developmentSourceRef : "main";
}

export function correspondingSourceUrl(): string {
  const ref = deployedSourceRef();
  return ref === "main"
    ? sourceRepositoryUrl
    : `${sourceRepositoryUrl}/tree/${ref}`;
}

export function sourceFileUrl(path: string): string {
  return `${sourceRepositoryUrl}/blob/${deployedSourceRef()}/${path}`;
}
