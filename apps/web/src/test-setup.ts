import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Every test mounts the whole app; without this they stack up in one document.
afterEach(cleanup);
