import assert from "node:assert/strict";
import { createDatabase, mutate, asUser, OWNER, STAFF } from "./db-harness.mjs";
const db = await createDatabase();
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("PASS", name);
  } catch (e) {
    console.error("FAIL", name, e.message);
    process.exitCode = 1;
  }
}
const id = () => crypto.randomUUID();
const call = (a, p, k = id(), u = OWNER) => mutate(db, a, p, k, u);
const client = (
  await call("save_client", {
    name: "QA Client",
    organisation: "Fictional QA Ltd",
    email: "qa@example.test",
    phone: "",
    billing_address: "Test billing",
    shipping_address: "Test shipping",
    gstin: "",
    notes: "PRIVATE CLIENT NOTE",
  })
).id;
const line = {
  description: "Custom tee",
  quantity: 80,
  unit_price: 650,
  discount_pct: 10,
  tax_rate: 18,
  hsn: "",
  details: "S:20 M:30 L:30 · sand · embroidery",
  category: "Apparel",
  cost: 123456,
};
const quote = (
  await call("save_quote", {
    title: "QA merchandise",
    client_id: client,
    lead_id: null,
    valid_until: "2026-12-31",
    tax_mode: "IGST",
    items: [line],
    terms: "QA terms",
  })
).id;
let order, invoice, artwork;
await test("fresh migrations create an empty commercial workspace", async () => {
  assert.equal(
    (await db.query("select count(*)::int n from orders")).rows[0].n,
    0,
  );
});
await test("database recomputes money and strips private line fields", async () => {
  const d = (await db.query("select * from documents where id=$1", [quote]))
    .rows[0];
  assert.equal(d.valid_until, "2026-12-31");
  assert.equal(Number(d.total), 55224);
  assert.equal(d.items[0].cost, undefined);
  assert.equal(d.customer.notes, undefined);
});
await test("cannot convert unaccepted quotation", async () => {
  await assert.rejects(call("convert_quote", { id: quote }), /Accept/);
});
await call("quote_status", { id: quote, status: "Accepted" });
await test("concurrent/repeated conversions return the same single order", async () => {
  const results = await Promise.all([
    call("convert_quote", { id: quote }),
    call("convert_quote", { id: quote }),
  ]);
  assert.equal(results[0].id, results[1].id);
  order = results[0].id;
  assert.equal(
    (await db.query("select count(*)::int n from orders")).rows[0].n,
    1,
  );
});
await test("accepted quote cannot be edited or status-reset", async () => {
  await assert.rejects(call("save_quote", { id: quote }), /immutable/);
  await assert.rejects(
    call("quote_status", { id: quote, status: "Draft" }),
    /cannot be changed/,
  );
});
await test("client edits cannot rewrite the accepted snapshot", async () => {
  await call("save_client", { id: client, name: "Changed name" });
  assert.equal(
    (await db.query("select customer from documents where id=$1", [quote]))
      .rows[0].customer.name,
    "QA Client",
  );
});
await test("quotation revision is a distinct draft without a share link", async () => {
  const r = await call("revise_quote", { id: quote });
  const d = (await db.query("select * from documents where id=$1", [r.id]))
    .rows[0];
  assert.equal(d.status, "Draft");
  assert.equal(d.revision_of, quote);
  assert.equal(d.share_token, null);
});
const update = {
  id: order,
  status: "Production",
  required_date: null,
  shipping_address: "Address",
  courier: "",
  tracking_ref: "",
  dispatched_on: null,
  delivered_on: null,
  approval_not_required: false,
  notes: "",
};
await test("production is blocked until current artwork approval", async () => {
  await assert.rejects(call("save_order", update), /Approve the latest/);
});
await test("private artwork upload and versioned approval unlock production", async () => {
  const path = order + "/" + id() + "/v1.pdf";
  await asUser(db, STAFF, (tx) =>
    tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
      "artwork",
      path,
    ]),
  );
  artwork = (
    await call("add_artwork", {
      order_id: order,
      file_name: "v1.pdf",
      storage_path: path,
      notes: "First proof",
    })
  ).id;
  await call("review_artwork", {
    id: artwork,
    status: "Approved",
    notes: "Approved by client on email",
  });
  await call("save_order", update);
});
await test("a new artwork version invalidates earlier approval", async () => {
  const path = order + "/" + id() + "/v2.pdf";
  await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
    "artwork",
    path,
  ]);
  await call("add_artwork", {
    order_id: order,
    file_name: "v2.pdf",
    storage_path: path,
    notes: "Revised",
  });
  assert.equal(
    (await db.query("select status from orders where id=$1", [order])).rows[0]
      .status,
    "Design & Approval",
  );
  await assert.rejects(
    call("review_artwork", { id: artwork, status: "Approved" }),
    /latest version/,
  );
  await assert.rejects(call("save_order", update), /Approve the latest/);
  await call("save_order", { ...update, approval_not_required: true });
});
await test("one invoice per order, including repeated creation", async () => {
  const a = await call("create_invoice", { id: order, due_on: "2026-12-31" });
  const b = await call("create_invoice", { id: order, due_on: null });
  assert.equal(a.id, b.id);
  invoice = a.id;
  await call("save_invoice", {
    id: invoice,
    title: "Revised merchandise requirements",
    due_on: "2026-12-31",
    tax_mode: "IGST",
    items: [{ ...line, unit_price: 700 }],
    terms: "Updated client terms",
  });
  assert.equal(
    (await db.query("select total from documents where id=$1", [invoice]))
      .rows[0].total,
    "59472.00",
  );
  await call("issue_invoice", { id: invoice, due_on: "2026-12-31" });
  await assert.rejects(
    call("save_invoice", {
      id: invoice,
      title: "Unsafe rewrite",
      due_on: null,
      tax_mode: "None",
      items: [line],
      terms: "",
    }),
    /Only active draft/,
  );
  await assert.rejects(
    call("issue_invoice", { id: invoice, due_on: null }),
    /Only draft/,
  );
});
const payment = {
  order_id: order,
  amount: 10000,
  kind: "Receipt",
  method: "Bank Transfer",
  payment_date: "2026-09-29",
  reference: "TEST",
  notes: "",
};
await test("payment retries are idempotent and concurrent-safe", async () => {
  const k = id();
  const [a, b] = await Promise.all([
    call("log_payment", payment, k),
    call("log_payment", payment, k),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(
    (await db.query("select count(*)::int n from payments")).rows[0].n,
    1,
  );
});
await test("issued invoice revisions preserve history and revoke old sharing", async () => {
  const original = invoice;
  await call("share_document", { id: original, enabled: true });
  const oldToken = (
    await db.query("select share_token from documents where id=$1", [original])
  ).rows[0].share_token;
  const key = id();
  const first = await call("revise_invoice", { id: original }, key);
  const retry = await call("revise_invoice", { id: original }, key);
  assert.equal(first.id, retry.id);
  invoice = first.id;
  assert.equal(
    (
      await db.query("select status,share_token from documents where id=$1", [
        original,
      ])
    ).rows[0].status,
    "Superseded",
  );
  assert.equal(
    await asUser(
      db,
      null,
      async (tx) =>
        (await tx.query("select shared_document($1::uuid) d", [oldToken]))
          .rows[0].d,
    ),
    null,
  );
  await assert.rejects(
    call("share_document", { id: original, enabled: true }),
    /Only current/,
  );
  await assert.rejects(
    call("revise_invoice", { id: original }),
    /Only active issued/,
  );
  await call("save_invoice", {
    id: invoice,
    title: "Final changed requirements",
    due_on: "2026-12-31",
    tax_mode: "IGST",
    items: [{ ...line, unit_price: 720 }],
    terms: "Final client terms",
  });
  assert.equal(
    (
      await db.query("select title,total,status from documents where id=$1", [
        original,
      ])
    ).rows[0].title,
    "Revised merchandise requirements",
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from documents where order_id=$1 and kind='invoice' and status<>'Superseded'",
        [order],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await call("create_invoice", { id: order, due_on: null })).id,
    invoice,
  );
  await call("issue_invoice", { id: invoice, due_on: "2026-12-31" });
});
await test("owner costs are invisible and unwritable to staff", async () => {
  await call("save_cost", { order_id: order, item_index: 0, amount: 12345 });
  await asUser(db, STAFF, async (tx) =>
    assert.equal((await tx.query("select * from order_costs")).rows.length, 0),
  );
  await assert.rejects(
    call(
      "save_cost",
      { order_id: order, item_index: 0, amount: 1 },
      id(),
      STAFF,
    ),
    /Owner access/,
  );
});
await test("staff cannot change business settings or user roles", async () => {
  await assert.rejects(call("save_settings", {}, id(), STAFF), /Owner access/);
  await assert.rejects(
    call("update_user", { id: OWNER, role: "staff" }, id(), STAFF),
    /User management requires Owner or Admin/,
  );
});
await test("admin and co-owner receive full access without changing staff rights", async () => {
  for (const role of ["admin", "co_owner"]) {
    const userId = id();
    await db.query(
      "insert into auth.users(id, email, raw_user_meta_data, invited_at) values($1, $2, $3::jsonb, now())",
      [userId, `${role}@example.test`, JSON.stringify({ full_name: role })],
    );
    await call("update_user", {
      id: userId,
      full_name: role,
      role,
      active: true,
    });
    await asUser(db, userId, async (tx) => {
      assert.equal(
        (await tx.query("select is_owner() allowed")).rows[0].allowed,
        true,
      );
      assert.equal(
        (await tx.query("select count(*)::int n from order_costs")).rows[0].n,
        1,
      );
      await tx.query("select update_my_profile($1)", [`${role} teammate`]);
    });
    assert.deepEqual(
      (
        await db.query(
          "select full_name, role, email from profiles where id=$1",
          [userId],
        )
      ).rows[0],
      { full_name: `${role} teammate`, role, email: `${role}@example.test` },
    );
    await db.query("update auth.users set email=$1 where id=$2", [
      `new-${role}@example.test`,
      userId,
    ]);
    assert.equal(
      (await db.query("select email from profiles where id=$1", [userId]))
        .rows[0].email,
      `new-${role}@example.test`,
    );
    await call(
      "save_cost",
      { order_id: order, item_index: 0, amount: 12345 },
      id(),
      userId,
    );
    if (role === "admin") {
      await call(
        "update_user",
        {
          id: STAFF,
          full_name: "Studio teammate",
          role: "staff",
          active: true,
        },
        id(),
        userId,
      );
    } else {
      await assert.rejects(
        call(
          "update_user",
          {
            id: STAFF,
            full_name: "Not allowed",
            role: "admin",
            active: true,
          },
          id(),
          userId,
        ),
        /User management requires Owner or Admin/,
      );
    }
  }
  await asUser(db, STAFF, async (tx) => {
    assert.equal(
      (await tx.query("select is_owner() allowed")).rows[0].allowed,
      false,
    );
    await tx.query("select update_my_profile($1)", ["Studio teammate"]);
  });
  assert.equal(
    (await db.query("select role from profiles where id=$1", [STAFF])).rows[0]
      .role,
    "staff",
  );
  await assert.rejects(
    call("update_user", {
      id: STAFF,
      full_name: "Bad",
      role: "superadmin",
      active: true,
    }),
    /profiles_role_check/,
  );
});
await test("deleting a user removes access but retains linked CRM history", async () => {
  const target = id();
  const admin = id();
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data,invited_at) values($1,'removed@example.test','{}',now()),($2,'manager@example.test','{}',now())",
    [target, admin],
  );
  await db.query("update profiles set role='admin' where id=$1", [admin]);
  const lead = id();
  await db.query(
    "insert into leads(id,name,assigned_to) values($1,'History', $2)",
    [lead, target],
  );
  await assert.rejects(
    asUser(db, target, (tx) =>
      tx.query("select set_team_user_removed($1,true)", [OWNER]),
    ),
    /User management requires Owner or Admin/,
  );
  await assert.rejects(
    asUser(db, OWNER, (tx) =>
      tx.query("select set_team_user_removed($1,true)", [OWNER]),
    ),
    /cannot remove your own account/,
  );
  await asUser(db, admin, (tx) =>
    tx.query("select set_team_user_removed($1,true)", [target]),
  );
  assert.equal(
    (
      await db.query(
        "select active,deleted_at is not null as removed from profiles where id=$1",
        [target],
      )
    ).rows[0].removed,
    true,
  );
  assert.equal(
    (await db.query("select assigned_to from leads where id=$1", [lead]))
      .rows[0].assigned_to,
    target,
  );
  await asUser(db, target, async (tx) => {
    assert.equal(
      (await tx.query("select is_member() allowed")).rows[0].allowed,
      false,
    );
  });
  await asUser(db, OWNER, (tx) =>
    tx.query("select set_team_user_removed($1,false)", [target]),
  );
  assert.deepEqual(
    (
      await db.query("select active,deleted_at from profiles where id=$1", [
        target,
      ])
    ).rows[0],
    { active: false, deleted_at: null },
  );
  await call("update_user", {
    id: target,
    full_name: "Restored",
    role: "staff",
    active: true,
  });
  await asUser(db, target, async (tx) => {
    assert.equal(
      (await tx.query("select is_member() allowed")).rows[0].allowed,
      true,
    );
  });
});
await test("direct table writes are denied even to authenticated owner", async () => {
  await assert.rejects(
    asUser(db, OWNER, (tx) =>
      tx.query("update documents set total=1 where id=$1", [quote]),
    ),
    /permission denied/,
  );
  await assert.rejects(
    asUser(db, STAFF, (tx) => tx.query("update profiles set role='owner'")),
    /permission denied/,
  );
});
await test("public links expose only an allowlisted document and can be revoked", async () => {
  await call("share_document", { id: quote, enabled: true });
  const token = (
    await db.query("select share_token from documents where id=$1", [quote])
  ).rows[0].share_token;
  const d = await asUser(
    db,
    null,
    async (tx) =>
      (await tx.query("select shared_document($1::uuid) d", [token])).rows[0].d,
  );
  assert.equal(d.ref.startsWith("Q-"), true);
  for (const key of [
    "id",
    "client_id",
    "lead_id",
    "share_token",
    "order_costs",
  ])
    assert.equal(d[key], undefined);
  assert.equal(JSON.stringify(d).includes("PRIVATE CLIENT NOTE"), false);
  await call("share_document", { id: quote, enabled: false });
  assert.equal(
    await asUser(
      db,
      null,
      async (tx) =>
        (await tx.query("select shared_document($1::uuid) d", [token])).rows[0]
          .d,
    ),
    null,
  );
});
await test("anonymous callers cannot read internal data, artwork or mutate", async () => {
  for (const fn of [
    "is_member()",
    "is_owner()",
    "can_manage_users()",
    "provision_profile()",
  ]) {
    assert.equal(
      (
        await db.query(
          "select has_function_privilege('anon', $1, 'EXECUTE') allowed",
          [fn],
        )
      ).rows[0].allowed,
      false,
    );
  }
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated', 'provision_profile()', 'EXECUTE') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await assert.rejects(
    asUser(db, null, (tx) => tx.query("select * from clients")),
    /permission denied/,
  );
  await assert.rejects(
    asUser(db, null, (tx) => tx.query("select * from storage.objects")),
    /permission denied/,
  );
  await assert.rejects(
    asUser(db, null, (tx) =>
      tx.query("select crm_mutate($1,$2,$3)", ["save_client", "{}", id()]),
    ),
    /permission denied/,
  );
});
await test("social app secrets and tokens are private; only Owner/Admin can connect", async () => {
  const saveApp = (user) => asUser(db, user, (tx) =>
    tx.query("select save_social_app_config($1,$2,$3,$4::text[])", [
      "instagram", "example-app-id", "v1.encrypted-app-secret-long-enough", ["instagram_business_basic"],
    ]),
  );
  await assert.rejects(saveApp(STAFF), /Owner or Admin/);
  await saveApp(OWNER);
  await assert.rejects(
    asUser(db, STAFF, (tx) => tx.query("select * from social_app_configs")),
    /permission denied/,
  );
  await assert.rejects(
    asUser(db, STAFF, (tx) => tx.query("select * from social_app_config_secret('instagram')")),
    /Owner or Admin/,
  );
  const publicSetup = await asUser(db, STAFF, (tx) =>
    tx.query("select * from social_app_config_status()"),
  );
  assert.equal(publicSetup.rows[0].client_id, "example-app-id");
  assert.equal(JSON.stringify(publicSetup.rows).includes("encrypted-app-secret"), false);
  await asUser(db, OWNER, (tx) =>
    tx.query("select save_social_connection($1,$2,$3,$4,$5,$6,$7::text[])", [
      "instagram", "123456", "thegoodchapter", "v1.encrypted-access-token-long-enough",
      null, null, ["instagram_business_basic"],
    ]),
  );
  const visible = await asUser(db, STAFF, (tx) =>
    tx.query("select * from social_connection_status()"),
  );
  assert.equal(visible.rows[0].display_name, "thegoodchapter");
  assert.equal(JSON.stringify(visible.rows).includes("encrypted-access-token"), false);
  await assert.rejects(
    asUser(db, STAFF, (tx) => tx.query("select * from social_connections")),
    /permission denied/,
  );
  await assert.rejects(
    asUser(db, STAFF, (tx) => tx.query("select remove_social_connection('instagram')")),
    /Owner or Admin/,
  );
  await asUser(db, OWNER, (tx) => tx.query("select remove_social_connection('instagram')"));
  assert.equal((await db.query("select count(*)::int n from social_connections")).rows[0].n, 0);
});
await test("Buffer key is private and duplicate post submissions are claimed once", async () => {
  await assert.rejects(
    asUser(db, STAFF, (tx) => tx.query("select save_buffer_config($1,$2,$3)", ["v1.ciphertext-long-enough-for-test", "org-1", "TGC"])),
    /Owner or Admin/,
  );
  await asUser(db, OWNER, (tx) => tx.query("select save_buffer_config($1,$2,$3)", ["v1.ciphertext-long-enough-for-test", "org-1", "TGC"]));
  const status = await asUser(db, STAFF, (tx) => tx.query("select * from buffer_config_status()"));
  assert.equal(status.rows[0].organization_name, "TGC");
  assert.equal(JSON.stringify(status.rows).includes("ciphertext"), false);
  await assert.rejects(asUser(db, STAFF, (tx) => tx.query("select * from buffer_config")), /permission denied/);
  await assert.rejects(asUser(db, STAFF, (tx) => tx.query("select * from buffer_config_secret()")), /Owner or Admin/);
  const requestId = id();
  const claim = () => asUser(db, OWNER, (tx) => tx.query("select * from claim_buffer_post($1,$2)", [requestId, "instagram-1"]));
  assert.equal((await claim()).rows[0].claimed, true);
  assert.equal((await claim()).rows[0].claimed, false);
  await assert.rejects(asUser(db, STAFF, (tx) => tx.query("select * from claim_buffer_post($1,$2)", [id(), "instagram-1"])), /Owner or Admin/);
  await asUser(db, OWNER, (tx) => tx.query("select finish_buffer_post($1,$2,$3,$4)", [requestId, "succeeded", "buffer-post-1", null]));
  assert.equal((await claim()).rows[0].buffer_post_id, "buffer-post-1");
});
await test("only Owner or Admin can upload public social media under their own folder", async () => {
  const bucket = (await db.query("select public, file_size_limit from storage.buckets where id='social-media'")).rows[0];
  assert.equal(bucket.public, true);
  assert.equal(Number(bucket.file_size_limit), 25 * 1024 * 1024);
  await asUser(db, OWNER, (tx) => tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", ["social-media", `${OWNER}/${id()}.jpg`]));
  await assert.rejects(asUser(db, OWNER, (tx) => tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", ["social-media", `${STAFF}/${id()}.jpg`])), /row-level security/);
  await assert.rejects(asUser(db, STAFF, (tx) => tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", ["social-media", `${STAFF}/${id()}.jpg`])), /row-level security/);
});
await test("members can upload only their own private profile photo", async () => {
  const path = STAFF + "/" + id() + ".jpg";
  await asUser(db, STAFF, (tx) =>
    tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
      "profile-avatars",
      path,
    ]),
  );
  await assert.rejects(
    asUser(db, OWNER, (tx) =>
      tx.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "profile-avatars",
        STAFF + "/" + id() + ".jpg",
      ]),
    ),
    /row-level security/,
  );
  await assert.rejects(
    asUser(db, OWNER, (tx) =>
      tx.query("select set_my_avatar($1)", [path]),
    ),
    /Upload a profile photo first/,
  );
  const previous = await asUser(db, STAFF, (tx) =>
    tx.query("select set_my_avatar($1) as previous", [path]),
  );
  assert.equal(previous.rows[0].previous, "");
  assert.equal(
    (await db.query("select avatar_path from profiles where id=$1", [STAFF]))
      .rows[0].avatar_path,
    path,
  );
  assert.equal(
    (await asUser(db, OWNER, (tx) =>
      tx.query("select count(*)::int as n from storage.objects where bucket_id='profile-avatars'"),
    )).rows[0].n,
    0,
  );
  await asUser(db, OWNER, (tx) =>
    tx.query("delete from storage.objects where bucket_id='profile-avatars' and name=$1", [path]),
  );
  assert.equal(
    (await db.query("select count(*)::int as n from storage.objects where name=$1", [path])).rows[0].n,
    1,
  );
  await asUser(db, STAFF, (tx) =>
    tx.query("select set_my_avatar('')"),
  );
  await asUser(db, STAFF, (tx) =>
    tx.query("delete from storage.objects where bucket_id='profile-avatars' and name=$1", [path]),
  );
  assert.equal(
    (await db.query("select count(*)::int as n from storage.objects where name=$1", [path])).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select avatar_path from profiles where id=$1", [STAFF]))
      .rows[0].avatar_path,
    "",
  );
});
await test("cancelled orders retain invoices/payments and prohibit new receipts", async () => {
  await call("save_order", {
    ...update,
    status: "Cancelled",
    approval_not_required: true,
  });
  assert.equal(
    (await db.query("select count(*)::int n from payments")).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("select status from documents where id=$1", [invoice]))
      .rows[0].status,
    "Issued",
  );
  await assert.rejects(call("log_payment", payment), /cancelled/);
  await call("log_payment", { ...payment, kind: "Refund", amount: 1000 });
  await assert.rejects(
    call("log_payment", { ...payment, kind: "Refund", amount: 100000 }),
    /exceeds receipts/,
  );
});
await test("lead conversion is idempotent and preserves enquiry history", async () => {
  const lead = (
    await call("save_lead", {
      name: "New person",
      organisation: "New org",
      source: "Other",
      stage: "New",
    })
  ).id;
  const a = await call("convert_lead", { id: lead });
  const b = await call("convert_lead", { id: lead });
  assert.equal(a.id, b.id);
});
await test("deactivated staff cannot use RPCs or read shared workspace", async () => {
  await call("update_user", {
    id: STAFF,
    full_name: "QA staff",
    role: "staff",
    active: false,
  });
  await assert.rejects(
    call("save_client", { name: "Bad" }, id(), STAFF),
    /active team account/,
  );
  await asUser(db, STAFF, async (tx) =>
    assert.equal((await tx.query("select * from clients")).rows.length, 0),
  );
});
await test("uninvited public signups have no workspace access", async () => {
  const uid = id();
  await db.query("insert into auth.users(id) values($1)", [uid]);
  assert.equal(
    (await db.query("select active from profiles where id=$1", [uid])).rows[0]
      .active,
    false,
  );
  await asUser(db, uid, async (tx) =>
    assert.equal((await tx.query("select * from clients")).rows.length, 0),
  );
  await assert.rejects(
    call("save_client", { name: "Bad" }, id(), uid),
    /active team account/,
  );
});
await test("mail drafts snapshot clients and can only be claimed once", async () => {
  await assert.rejects(
    asUser(db, OWNER, (tx) => tx.query("select save_mail_campaign(null,'Hello','A note',array[$1]::uuid[])", [client])),
    /Connect your mailbox/,
  );
  await asUser(db, OWNER, (tx) => tx.query("select save_mail_credentials('hello@thegoodchapter.in','v1.long-encrypted-value-for-test-only')"));
  const configured = (await db.query("select sender_email,reply_to_email from mail_settings")).rows[0];
  assert.equal(configured.sender_email, "hello@thegoodchapter.in");
  assert.equal(configured.reply_to_email, "hello@thegoodchapter.in");
  await asUser(db, OWNER, (tx) => tx.query("select save_mail_settings('Chapter','other@thegoodchapter.in','other@thegoodchapter.in','','')"));
  assert.equal((await db.query("select sender_email from mail_settings")).rows[0].sender_email, "hello@thegoodchapter.in");
  const draft = await asUser(db, OWNER, async (tx) =>
    (await tx.query("select save_mail_campaign(null,'Hello {{first_name}}','A note',array[$1]::uuid[]) as id", [client])).rows[0].id,
  );
  const recipient = (await db.query("select email,name from mail_recipients where campaign_id=$1", [draft])).rows[0];
  assert.equal(recipient.email, "qa@example.test");
  assert.equal(recipient.name, "Changed name");
  const first = await asUser(db, OWNER, (tx) => tx.query("select claim_mail_campaign($1) as claimed", [draft]));
  const second = await asUser(db, OWNER, (tx) => tx.query("select claim_mail_campaign($1) as claimed", [draft]));
  assert.equal(first.rows[0].claimed, true);
  assert.equal(second.rows[0].claimed, false);
  await assert.rejects(asUser(db, OWNER, (tx) => tx.query("select save_mail_campaign($1,'Changed','No',array[$2]::uuid[])", [draft, client])), /Only drafts/);
  const unsent = await asUser(db, OWNER, async (tx) =>
    (await tx.query("select save_mail_campaign(null,'Later','A note',array[$1]::uuid[]) as id", [client])).rows[0].id,
  );
  await db.query("delete from mail_credentials");
  await assert.rejects(asUser(db, OWNER, (tx) => tx.query("select claim_mail_campaign($1)", [unsent])), /Connect your mailbox/);
});
await test("mail credentials stay private and inactive staff cannot manage mail", async () => {
  await asUser(db, OWNER, (tx) => tx.query("select save_mail_credentials('hello@thegoodchapter.in','v1.long-encrypted-value-for-test-only')"));
  await asUser(db, OWNER, async (tx) => {
    await assert.rejects(tx.query("select * from mail_credentials"), /permission denied/);
  });
  await asUser(db, STAFF, async (tx) =>
    assert.equal((await tx.query("select * from mail_campaigns")).rows.length, 0),
  );
  await assert.rejects(asUser(db, STAFF, (tx) => tx.query("select save_mail_campaign(null,'Hi','Hello',array[$1]::uuid[])", [client])), /Owner or Admin/);
});
await test("imported sent mail is private and deduplicated", async () => {
  const imported = {
    imap_id: "imap:hello@thegoodchapter.in:Sent:1:42",
    from_email: "hello@thegoodchapter.in",
    to_email: "qa@example.test",
    subject: "Earlier note",
    body: "Sent from the original mailbox",
  };
  await db.query(
    "insert into mail_sent(imap_id,from_email,to_email,subject,body) values($1,$2,$3,$4,$5) on conflict(imap_id) do nothing",
    Object.values(imported),
  );
  await db.query(
    "insert into mail_sent(imap_id,from_email,to_email,subject,body) values($1,$2,$3,$4,$5) on conflict(imap_id) do nothing",
    Object.values(imported),
  );
  assert.equal((await db.query("select count(*)::int n from mail_sent")).rows[0].n, 1);
  await asUser(db, OWNER, async (tx) =>
    assert.equal((await tx.query("select subject from mail_sent")).rows[0].subject, "Earlier note"),
  );
  await asUser(db, STAFF, async (tx) =>
    assert.equal((await tx.query("select * from mail_sent")).rows.length, 0),
  );
  await assert.rejects(
    asUser(db, OWNER, (tx) => tx.query("delete from mail_sent")),
    /permission denied/,
  );
});
console.log(`${passed} database scenarios passed`);
await db.close();
