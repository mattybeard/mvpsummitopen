export const config = {
  /**
   * Set this to the real opening time as a UTC ISO string, such as "2026-12-02T16:00:00Z".
   * The form then closes and the board ranks everyone by how close they got.
   * Also set the ENTRIES_CLOSED app setting to "true" so the API stops accepting guesses.
   */
  actualOpening: null as string | null,
};
