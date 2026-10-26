// Supabase projects, one for development and one for the stores. These are
// the publishable keys, which are meant to ship inside the app; the secret
// keys never leave the Supabase dashboard. Tester and store builds (eas.json
// "preview" and "production") use prod; development builds and
// `npx expo start` use dev.
//
// Empty until the projects exist (see "Online play" in the README). While a
// project is missing, the app plays offline: online cards say so and nothing
// is sent anywhere.
const PROJECTS = {
  dev: {
    url: '',
    key: '',
  },
  prod: {
    url: '',
    key: '',
  },
};

export const CLOUD_ENV = process.env.EXPO_PUBLIC_SUPABASE_ENV === 'prod' ? 'prod' : 'dev';
export const SUPABASE = PROJECTS[CLOUD_ENV];
/** Whether this build has a Supabase project to talk to. */
export const CLOUD_READY = SUPABASE.url !== '' && SUPABASE.key !== '';
