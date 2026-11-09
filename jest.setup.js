import "@testing-library/jest-dom";

// A fixed fake secret so code that signs invite links can run in any test.
process.env.INVITE_LINK_SECRET ??=
  "test-invite-secret-long-enough-for-hmac-0123456789";
