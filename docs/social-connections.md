# Instagram and LinkedIn connections

Only an Owner or Admin can configure or connect social accounts. The CRM stores developer app secrets and OAuth tokens encrypted with `SOCIAL_TOKEN_KEY`. Keep this server-only key in Vercel Production and in `.env.local` for local development. Do not rotate it without a migration plan: existing encrypted secrets and tokens would become unreadable.

The connection flow is in **User settings → Integrations**. The business account owner completes the provider's consent screen in their own browser; they never type their Instagram or LinkedIn password into the CRM.

## Instagram

1. In [Meta for Developers](https://developers.facebook.com/apps/), create an app for The Good Chapter and add the **Instagram API with Instagram Login** product. Use the Instagram Professional account. This flow does not require linking a Facebook Page.
2. Add `https://app.thegoodchapter.in/api/connections/instagram/callback` as an allowed OAuth redirect URI, and allow `app.thegoodchapter.in` in the app/domain configuration where requested.
3. Start with `instagram_business_basic`. Add content publishing, messages, or comments permissions only after they appear as available in the Meta app. Meta may require app review or business verification for broader access.
4. Copy the **Instagram app ID** and **Instagram app secret** into the CRM's Instagram setup form; save it, then click **Connect Instagram** and approve access in the browser.

## LinkedIn

1. In [LinkedIn Developers](https://www.linkedin.com/developers/apps), create an app associated with The Good Chapter. Add **Sign In with LinkedIn using OpenID Connect** to get the `openid` and `profile` scopes. The person connecting must administer the Company Page.
2. Add `https://app.thegoodchapter.in/api/connections/linkedin/callback` to the app's authorised redirect URLs. Copy its client ID and client secret into the CRM's LinkedIn setup form.
3. Start with `openid` and `profile`. Company Page posting and reading need LinkedIn **Community Management API** access and approval. Request that product in the developer portal before selecting `w_organization_social` or `r_organization_social` in the CRM.
4. Save the app setup, click **Connect LinkedIn**, and approve the consent screen in the browser.

This release establishes OAuth account authorization and records the connected identity. It does not yet sync messages, select the LinkedIn Company Page, schedule posts, or publish content. Those workflows need their own implementation and approved platform permissions. Instagram tokens expire and must currently be reconnected from Settings; LinkedIn access may also require reauthorization. The CRM shows token expiry when the provider supplies it.

If a connection fails, verify the exact callback URL, enabled product and scopes, and the account's app role or review status. The OAuth callback displays a generic error and does not print credentials or provider tokens to the browser.
