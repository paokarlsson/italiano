/**
 * Kopplingen till det publika biblioteket på Google Drive. Inget här är hemligt — allt syns
 * ändå i en statisk sida — men API-nyckeln ska vara låst till sidans adress och till Drive
 * API i Google Cloud Console. Se «Google» i README för hur värdena tas fram.
 *
 * Tomma värden stänger av det som beror på dem; resten av appen fungerar som vanligt.
 */
export const CLOUD = {
  /** OAuth-klientens ID. Behövs bara för den som publicerar. */
  clientId: '',
  /** API-nyckel för att läsa den publika mappen utan inloggning. */
  apiKey: '',
  /** Id för den publika mappen. Appen skapar mappen och visar id:t första gången. */
  folderId: '',
};
