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
await test("discount display is saved, shared, and inherited by quote revisions", async () => {
  const q = (await call("save_quote", {
    title: "No-discount display", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", items: [{ ...line, discount_pct: 0, tax_rate: 0 }],
    terms: "", show_discount: false,
  })).id;
  assert.equal((await db.query("select show_discount from documents where id=$1", [q])).rows[0].show_discount, false);
  await assert.rejects(call("save_quote", {
    id: q, title: "Invalid hidden discount", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", items: [{ ...line, tax_rate: 0 }],
    terms: "", show_discount: false,
  }), /Hidden discounts must be zero/);
  await call("quote_status", { id: q, status: "Sent" });
  await call("share_document", { id: q, enabled: true });
  const token = (await db.query("select share_token from documents where id=$1", [q])).rows[0].share_token;
  const shared = await asUser(db, null, async (tx) =>
    (await tx.query("select shared_document($1::uuid) d", [token])).rows[0].d);
  assert.equal(shared.show_discount, false);
  const revision = (await call("revise_quote", { id: q })).id;
  assert.equal((await db.query("select show_discount from documents where id=$1", [revision])).rows[0].show_discount, false);
});
await test("quotation group notes and order survive normalization", async () => {
  const groups = ["Packaging", "Drinkware"].map((title) => ({
    id: id(), title, note: `${title} applies to the whole group`, quantity: 80,
    options: [{ id: id(), title: `${title} choice`, details: "", image_path: "", unit_price: 0 }],
  }));
  const normalized = (await db.query("select public.normalize_quote_options($1::jsonb) as groups", [JSON.stringify(groups)])).rows[0].groups;
  assert.deepEqual(normalized.map(({ title, note }) => [title, note]), [
    ["Packaging", "Packaging applies to the whole group"],
    ["Drinkware", "Drinkware applies to the whole group"],
  ]);
});
await test("quotation photos and client choices survive sharing and revision", async () => {
  const path = `${OWNER}/${id()}.png`;
  const groupId = id();
  const optionId = id();
  const options = [{
    id: groupId, title: "Diwali hamper finishing touch", note: "Choose one finishing touch for the hamper.", quantity: 80,
    options: [{ id: optionId, title: "Hand painted diya", details: "Assorted colours",
      image_path: path, unit_price: 85 }],
  }];
  await assert.rejects(call("save_quote", {
    title: "Missing photo", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", items: [line],
    quote_options: options, terms: "",
  }), /Invalid quotation option/);
  await db.query("insert into storage.objects(bucket_id,name) values('quote-options',$1)", [path]);
  const q = (await call("save_quote", {
    title: "Diwali hamper", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None",
    items: [{ ...line, image_path: path, moq: 50, notes: "Lead time: two weeks" }],
    quote_options: options, client_choice_enabled: true, terms: "",
  })).id;
  const saved = (await db.query("select * from documents where id=$1", [q])).rows[0];
  assert.equal(saved.items[0].image_path, path);
  assert.equal(saved.items[0].moq, 50);
  assert.equal(saved.items[0].notes, "Lead time: two weeks");
  assert.equal(saved.quote_options[0].options[0].image_path, path);
  assert.equal(saved.quote_options[0].note, "Choose one finishing touch for the hamper.");
  assert.equal(saved.client_choice_enabled, true);
  assert.equal(Number(saved.total), 46800);
  await call("quote_status", { id: q, status: "Sent" });
  await call("share_document", { id: q, enabled: true });
  const token = (await db.query("select share_token from documents where id=$1", [q])).rows[0].share_token;
  const shared = (await asUser(db, null, async (tx) =>
    (await tx.query("select shared_document($1::uuid) d", [token])).rows[0].d
  ));
  assert.equal(shared.quote_options[0].options[0].title, "Hand painted diya");
  assert.equal(shared.quote_options[0].note, "Choose one finishing touch for the hamper.");
  await assert.rejects(asUser(db, null, (tx) =>
    tx.query("select select_quote_options($1::uuid,$2::jsonb)", [token, JSON.stringify({ [groupId]: id() })])
  ), /Choose one option/);
  await asUser(db, null, (tx) =>
    tx.query("select select_quote_options($1::uuid,$2::jsonb)", [token, JSON.stringify({ [groupId]: optionId })])
  );
  const chosen = (await db.query("select total,quote_selections,quote_selected_at from documents where id=$1", [q])).rows[0];
  assert.equal(chosen.quote_selections[groupId], optionId);
  assert.ok(chosen.quote_selected_at);
  assert.equal(Number(chosen.total), Number(saved.total));
  const revisionId = (await call("revise_quote", { id: q })).id;
  const revision = (await db.query("select quote_options,quote_selections from documents where id=$1", [revisionId])).rows[0];
  assert.equal(revision.quote_options[0].options[0].id, optionId);
  assert.deepEqual(revision.quote_selections, {});
});
await test("selection proposals stay unpriced until a priced revision", async () => {
  const groupId = id();
  const selectedId = id();
  const choices = [{ id: groupId, title: "Hamper finish", quantity: 80,
    options: [
      { id: selectedId, title: "Diya", details: "Hand painted", image_path: "", unit_price: 0 },
      { id: id(), title: "Keychain", details: "Brass", image_path: "", unit_price: 0 },
    ] }];
  const proposal = (await call("save_quote", {
    title: "Diwali hamper choices", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", pricing_mode: "selection",
    items: [], quote_options: choices, terms: "Prices follow your choices",
  })).id;
  const saved = (await db.query("select * from documents where id=$1", [proposal])).rows[0];
  assert.equal(saved.pricing_mode, "selection");
  assert.equal(Number(saved.total), 0);
  assert.equal(saved.items[0].description, "Selection proposal");
  await assert.rejects(call("quote_status", { id: proposal, status: "Accepted" }), /priced quotation/);
  await assert.rejects(call("save_quote", {
    title: "Invalid priced choice", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", pricing_mode: "selection",
    items: [], quote_options: [{ ...choices[0], options: [{ ...choices[0].options[0], unit_price: 85 }] }], terms: "",
  }), /cannot contain prices/);
  await call("share_document", { id: proposal, enabled: true });
  const sharedRow = (await db.query("select share_token,status from documents where id=$1", [proposal])).rows[0];
  assert.equal(sharedRow.status, "Sent");
  const token = sharedRow.share_token;
  const shared = await asUser(db, null, async (tx) =>
    (await tx.query("select shared_document($1::uuid) d", [token])).rows[0].d);
  assert.equal(shared.pricing_mode, "selection");
  assert.equal(shared.client_choice_enabled, false);
  await assert.rejects(asUser(db, null, (tx) =>
    tx.query("select select_quote_options($1::uuid,$2::jsonb)", [token, JSON.stringify({ [groupId]: selectedId })])),
  /selection is disabled/);
  await call("save_quote", {
    id: proposal, title: saved.title, client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", pricing_mode: "selection",
    items: [], quote_options: choices, client_choice_enabled: true, terms: saved.terms,
  });
  assert.equal((await db.query("select share_token from documents where id=$1", [proposal])).rows[0].share_token, token);
  await asUser(db, null, (tx) =>
    tx.query("select select_quote_options($1::uuid,$2::jsonb)", [token, JSON.stringify({ [groupId]: selectedId })]));
  const revisionId = (await call("revise_quote", { id: proposal })).id;
  const revision = (await db.query("select * from documents where id=$1", [revisionId])).rows[0];
  assert.equal(revision.pricing_mode, "priced");
  assert.equal(revision.items[0].description, "Diya");
  assert.equal(revision.items[0].quantity, 80);
  assert.equal(Number(revision.items[0].unit_price), 0);
  assert.deepEqual(revision.quote_options, []);
  await assert.rejects(call("quote_status", { id: revisionId, status: "Sent" }), /Add prices/);
  await call("save_quote", {
    id: revisionId, title: revision.title, client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", pricing_mode: "priced",
    items: [{ ...revision.items[0], unit_price: 125 }], quote_options: [], terms: revision.terms,
  });
  await call("quote_status", { id: revisionId, status: "Sent" });
  await assert.rejects(call("quote_status", { id: proposal, status: "Accepted" }), /priced quotation/);
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
  const mimeTypes = (await db.query("select allowed_mime_types from storage.buckets where id='artwork'")).rows[0].allowed_mime_types;
  assert(mimeTypes.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
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
  await call("save_invoice", {
    id: invoice, title: "Revised merchandise requirements", due_on: "2026-12-31",
    tax_mode: "IGST", items: [{ ...line, unit_price: 700, discount_pct: 0 }],
    terms: "Updated client terms", show_discount: false,
  });
  const withoutDiscount = (await db.query("select show_discount,items from documents where id=$1", [invoice])).rows[0];
  assert.equal(withoutDiscount.show_discount, false);
  assert.equal(withoutDiscount.items[0].discount_pct, 0);
  await call("save_invoice", {
    id: invoice, title: "Revised merchandise requirements", due_on: "2026-12-31",
    tax_mode: "IGST", items: [{ ...line, unit_price: 700 }],
    terms: "Updated client terms", show_discount: true,
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
  assert.equal(
    (await db.query("select business->>'gstin' as gstin from documents where id=$1", [original])).rows[0].gstin,
    "",
  );
  await db.query("update workspace_settings set gstin=$1", ["22AAAAA0000A1Z5"]);
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
    (await db.query("select business->>'gstin' as gstin from documents where id=$1", [invoice])).rows[0].gstin,
    "22AAAAA0000A1Z5",
  );
  assert.equal(
    (await db.query("select business->>'gstin' as gstin from documents where id=$1", [original])).rows[0].gstin,
    "",
  );
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
await test("shared quotation engagement is counted without exposing raw visits", async () => {
  const groupId = id();
  const optionId = id();
  const q = (await call("save_quote", {
    title: "Engagement QA", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", items: [line], terms: "",
    quote_options: [{ id: groupId, title: "Packaging", quantity: 80,
      options: [{ id: optionId, title: "Gift box", details: "", image_path: "", unit_price: 25 }] }],
    client_choice_enabled: true,
  })).id;
  await call("quote_status", { id: q, status: "Sent" });
  await call("share_document", { id: q, enabled: true });
  const token = (await db.query("select share_token from documents where id=$1", [q])).rows[0].share_token;
  const visit = id();
  const visitor = id();
  const record = (event, option = null, percent = null) => asUser(db, null, (tx) =>
    tx.query("select record_quote_share_event($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid,$6::smallint,$7::text,$8::text,$9::text,$10::text)",
      [token, visit, visitor, event, option, percent,
        event === "open" ? "mobile" : null, event === "open" ? "Safari" : null,
        event === "open" ? "IN" : null, event === "open" ? "DL" : null]));
  await assert.rejects(record("pdf_click"), /Open the quotation/);
  await record("open");
  await record("open");
  await record("scroll", null, 50);
  await record("scroll", null, 50);
  await record("scroll", null, 100);
  await record("pdf_click");
  await record("pdf_ready");
  await record("option_click", optionId);
  await record("choices_submit");
  await assert.rejects(record("option_click", id()), /Invalid quotation option/);
  const stats = await asUser(db, OWNER, async (tx) =>
    (await tx.query("select quote_share_stats($1::uuid) as stats", [q])).rows[0].stats);
  assert.equal(Number(stats.opens), 1);
  assert.equal(Number(stats.unique_sessions), 1);
  assert.equal(Number(stats.pdf_clicks), 1);
  assert.equal(Number(stats.pdf_started), 1);
  assert.equal(Number(stats.option_clicks), 1);
  assert.equal(Number(stats.scrolled_halfway), 1);
  assert.equal(Number(stats.reached_end), 1);
  assert.equal(Number(stats.choices_submitted), 1);
  assert.equal(Number(stats.option_clicks_by_id[optionId]), 1);
  assert.equal(Number(stats.devices.mobile), 1);
  assert.equal(stats.recent_visits[0].country_code, "IN");
  assert.equal(stats.recent_visits[0].region_code, "DL");
  assert.equal(stats.recent_visits[0].device_category, "mobile");
  assert.equal(Number(stats.recent_visits[0].scroll_percent), 100);
  assert.equal(Number(stats.recent_visits[0].pdf_started), 1);
  await assert.rejects(asUser(db, null, (tx) =>
    tx.query("select quote_share_stats($1::uuid)", [q])), /permission denied/);
  await assert.rejects(asUser(db, null, (tx) =>
    tx.query("select * from quote_share_events")), /permission denied/);
  await call("share_document", { id: q, enabled: false });
  await assert.rejects(record("open"), /unavailable/);
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
await test("mail drafts accept new addresses without creating clients", async () => {
  await asUser(db, OWNER, (tx) =>
    tx.query(
      "select save_mail_credentials('hello@thegoodchapter.in','v1.long-encrypted-value-for-test-only')",
    ),
  );
  const direct = await asUser(
    db,
    OWNER,
    async (tx) =>
      (
        await tx.query(
          "select save_mail_campaign_with_recipients(null,'A personal note','Hello',array[]::uuid[],$1::jsonb) as id",
          [JSON.stringify([{ name: "New person", email: "New@Example.test" }])],
        )
      ).rows[0].id,
  );
  const rows = (
    await db.query(
      "select client_id,name,email from mail_recipients where campaign_id=$1",
      [direct],
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].client_id, null);
  assert.equal(rows[0].name, "New person");
  assert.equal(rows[0].email, "new@example.test");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from clients where lower(email)='new@example.test'",
      )
    ).rows[0].n,
    0,
  );

  await asUser(db, OWNER, (tx) =>
    tx.query(
      "select save_mail_campaign_with_recipients($1,'Updated','Hello',array[$2]::uuid[],$3::jsonb)",
      [
        direct,
        client,
        JSON.stringify([{ name: "Other person", email: "other@example.test" }]),
      ],
    ),
  );
  const edited = (
    await db.query(
      "select email from mail_recipients where campaign_id=$1 order by email",
      [direct],
    )
  ).rows;
  assert.deepEqual(
    edited.map((row) => row.email),
    ["other@example.test", "qa@example.test"],
  );
  await assert.rejects(
    asUser(db, OWNER, (tx) =>
      tx.query(
        "select save_mail_campaign_with_recipients(null,'Nope','Hello',array[]::uuid[],$1::jsonb)",
        [
          JSON.stringify([
            { name: "A", email: "a@example.test" },
            { name: "B", email: "A@example.test" },
          ]),
        ],
      ),
    ),
    /unique/,
  );
  await assert.rejects(
    asUser(db, OWNER, (tx) =>
      tx.query(
        "select save_mail_campaign_with_recipients(null,'Nope','Hello',array[]::uuid[],$1::jsonb)",
        [JSON.stringify([{ name: "A", email: "invalid" }])],
      ),
    ),
    /valid recipient/,
  );
  await db.query(
    "insert into mail_opt_outs(email) values('blocked@example.test') on conflict do nothing",
  );
  await assert.rejects(
    asUser(db, OWNER, (tx) =>
      tx.query(
        "select save_mail_campaign_with_recipients(null,'Nope','Hello',array[]::uuid[],$1::jsonb)",
        [JSON.stringify([{ name: "Blocked", email: "blocked@example.test" }])],
      ),
    ),
    /opted out/,
  );
  const claimed = await asUser(db, OWNER, (tx) =>
    tx.query("select claim_mail_campaign($1) as claimed", [direct]),
  );
  assert.equal(claimed.rows[0].claimed, true);
  await assert.rejects(
    asUser(db, OWNER, (tx) =>
      tx.query(
        "select save_mail_campaign_with_recipients($1,'Again','Hello',array[]::uuid[],$2::jsonb)",
        [
          direct,
          JSON.stringify([{ name: "New", email: "again@example.test" }]),
        ],
      ),
    ),
    /Only drafts/,
  );
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
await test("vendor catalogue storage accepts the vendor folder", async () => {
  const vendorId = (await call("save_vendor", {
    name: "Size chart supplier", category: "Apparel", contact_name: "",
    email: "", phone: "", city: "Delhi NCR", notes: "",
  })).id;
  const path = `${vendorId}/${id()}.pdf`;
  await asUser(db, OWNER, (tx) =>
    tx.query("insert into storage.objects(bucket_id,name) values('vendor-catalogs',$1)", [path]));
  const files = await asUser(db, OWNER, (tx) =>
    tx.query("select name from storage.objects where bucket_id='vendor-catalogs' and name=$1", [path]));
  assert.equal(files.rows[0].name, path);
  await assert.rejects(asUser(db, OWNER, (tx) =>
    tx.query("insert into storage.objects(bucket_id,name) values('vendor-catalogs',$1)", [`${id()}/${id()}.pdf`])
  ), /row-level security/);
  await asUser(db, OWNER, (tx) =>
    tx.query("delete from storage.objects where bucket_id='vendor-catalogs' and name=$1", [path]));
  assert.equal((await db.query("select count(*)::int n from storage.objects where name=$1", [path])).rows[0].n, 0);
});
await test("vendor products and private catalogue require a real upload", async () => {
  const vendorId = (await call("save_vendor", {
    name: "Example apparel maker", category: "Apparel",
    subcategories: "Hoodies, varsity jackets, T-shirts, sweatshirts",
    social_links: "Instagram: @examplemaker", products_list: "Hoodies\nCandles",
    contact_name: "", email: "", phone: "", city: "Delhi NCR", notes: "",
  })).id;
  const saved = (await asUser(db, OWNER, (tx) =>
    tx.query("select subcategories,city,catalog_path,social_links,products_list from vendors where id=$1", [vendorId])
  )).rows[0];
  assert.match(saved.subcategories, /Hoodies/);
  assert.match(saved.social_links, /Instagram/);
  assert.match(saved.products_list, /Candles/);
  assert.equal(saved.city, "Delhi NCR");
  assert.equal(saved.catalog_path, "");
  const path = `${vendorId}/${id()}.pdf`;
  await assert.rejects(asUser(db, OWNER, (tx) =>
    tx.query("select set_vendor_catalog($1,$2,$3)", [vendorId, path, "example.pdf"])
  ), /Upload a valid catalogue first/);
  await db.query("insert into storage.objects(bucket_id,name) values('vendor-catalogs',$1)", [path]);
  await assert.rejects(asUser(db, OWNER, (tx) =>
    tx.query("select set_vendor_catalog($1,$2,$3)", [id(), path, "example.pdf"])
  ), /Vendor not found/);
  const previous = await asUser(db, OWNER, (tx) =>
    tx.query("select set_vendor_catalog($1,$2,$3) as old", [vendorId, path, "example.pdf"])
  );
  assert.equal(previous.rows[0].old, "");
  assert.equal((await db.query("select catalog_name from vendors where id=$1", [vendorId])).rows[0].catalog_name, "example.pdf");
  await asUser(db, OWNER, (tx) =>
    tx.query("select set_vendor_catalog($1,'','')", [vendorId])
  );
  assert.equal((await db.query("select catalog_path from vendors where id=$1", [vendorId])).rows[0].catalog_path, "");
  const pdfPath = `${vendorId}/${id()}.pdf`;
  const imagePath = `${vendorId}/${id()}.png`;
  const sheetPath = `${vendorId}/${id()}.xlsx`;
  await db.query("insert into storage.objects(bucket_id,name) values('vendor-catalogs',$1),('vendor-catalogs',$2),('vendor-catalogs',$3)", [pdfPath, imagePath, sheetPath]);
  const first = (await asUser(db, OWNER, (tx) =>
    tx.query("select add_vendor_catalog($1,$2,$3) as id", [vendorId, pdfPath, "Lookbook.pdf"])
  )).rows[0].id;
  await asUser(db, OWNER, (tx) =>
    tx.query("select add_vendor_catalog($1,$2,$3) as id", [vendorId, imagePath, "Pricing.png"])
  );
  await asUser(db, OWNER, (tx) =>
    tx.query("select add_vendor_catalog($1,$2,$3)", [vendorId, sheetPath, "Products.xlsx"])
  );
  assert.equal((await asUser(db, OWNER, (tx) =>
    tx.query("select * from vendor_catalogs where vendor_id=$1", [vendorId])
  )).rows.length, 3);
  await assert.rejects(asUser(db, OWNER, (tx) =>
    tx.query("select add_vendor_catalog($1,$2,$3)", [id(), pdfPath, "Wrong vendor.pdf"])
  ), /Vendor not found/);
  await assert.rejects(asUser(db, OWNER, (tx) =>
    tx.query("select add_vendor_catalog($1,$2,$3)", [vendorId, `${id()}/${id()}.pdf`, "Wrong folder.pdf"])
  ), /Upload a valid catalogue first/);
  const removed = (await asUser(db, OWNER, (tx) =>
    tx.query("select remove_vendor_catalog($1) as path", [first])
  )).rows[0].path;
  assert.equal(removed, pdfPath);
  assert.equal((await db.query("select id from vendor_catalogs where vendor_id=$1", [vendorId])).rows.length, 2);
});
await test("invoice QR requires a configured UPI ID and manager access", async () => {
  const invoice = (await db.query("select id from documents where kind='invoice' and status in ('Draft','Issued') limit 1")).rows[0];
  assert.ok(invoice);
  await assert.rejects(asUser(db, OWNER, (tx) =>
    tx.query("select set_invoice_payment_qr($1,true)", [invoice.id])
  ), /Add a business UPI ID/);
  await assert.rejects(asUser(db, OWNER, (tx) =>
    tx.query("select save_payment_upi($1)", ["not-a-upi-id"])
  ), /valid business UPI ID/);
  await asUser(db, OWNER, (tx) => tx.query("select save_payment_upi($1)", ["  GoodChapter@okbizaxis  "]));
  await db.query("update profiles set active=true where id=$1", [STAFF]);
  await assert.rejects(asUser(db, STAFF, (tx) =>
    tx.query("select set_invoice_payment_qr($1,true)", [invoice.id])
  ), /Owner or Admin access required/);
  await asUser(db, OWNER, (tx) => tx.query("select set_invoice_payment_qr($1,true)", [invoice.id]));
  const row = (await db.query("select payment_qr_enabled,business->>'upi_id' as upi_id from documents where id=$1", [invoice.id])).rows[0];
  assert.equal(row.payment_qr_enabled, true);
  assert.equal(row.upi_id, "goodchapter@okbizaxis");
  await asUser(db, OWNER, (tx) => tx.query("select set_invoice_payment_qr($1,false)", [invoice.id]));
  assert.equal((await db.query("select payment_qr_enabled from documents where id=$1", [invoice.id])).rows[0].payment_qr_enabled, false);
});
await test("only Owner/Admin may edit payments or delete records", async () => {
  await db.query("update profiles set active=true where id=$1", [STAFF]);
  const payment = (await db.query("select * from payments where kind='Receipt' limit 1")).rows[0];
  assert.ok(payment);
  const changes = { id: payment.id, order_id: payment.order_id, kind: payment.kind,
    amount: 321, method: "UPI", payment_date: "2026-10-03",
    reference: "TEST-EDIT", notes: "Corrected entry" };
  await assert.rejects(call("update_payment", changes, id(), STAFF), /Owner or Admin/);
  await call("update_payment", changes);
  assert.equal((await db.query("select reference from payments where id=$1", [payment.id])).rows[0].reference, "TEST-EDIT");
  await assert.rejects(call("delete_record", { kind: "payment", id: payment.id }, id(), STAFF), /Owner or Admin/);
  await assert.rejects(call("delete_record", { kind: "quote", id: quote }), /Remove linked/);
  const spareVendor = (await call("save_vendor", {
    name: "Temporary maker", category: "Apparel", contact_name: "",
    email: "", phone: "", city: "Delhi NCR", notes: "",
  })).id;
  await call("delete_record", { kind: "vendor", id: spareVendor });
  assert.equal((await db.query("select count(*)::int n from vendors where id=$1", [spareVendor])).rows[0].n, 0);
});
await test("invoice and invoice revision inherit hidden discounts", async () => {
  const q = (await call("save_quote", {
    title: "Discount-free order", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", items: [{ ...line, discount_pct: 0, tax_rate: 0 }],
    terms: "", show_discount: false,
  })).id;
  await call("quote_status", { id: q, status: "Accepted" });
  const newOrder = (await call("convert_quote", { id: q })).id;
  const firstInvoice = (await call("create_invoice", { id: newOrder, due_on: null })).id;
  assert.equal((await db.query("select show_discount from documents where id=$1", [firstInvoice])).rows[0].show_discount, false);
  await call("issue_invoice", { id: firstInvoice, due_on: null });
  const revision = (await call("revise_invoice", { id: firstInvoice })).id;
  assert.equal((await db.query("select show_discount from documents where id=$1", [revision])).rows[0].show_discount, false);
});
await test("client size link saves rows and keeps other orders private", async () => {
  const q = (await call("save_quote", {
    title: "Team apparel", client_id: client, lead_id: null,
    valid_until: null, tax_mode: "None", items: [{ ...line, discount_pct: 0, tax_rate: 0 }],
    terms: "", show_discount: false,
  })).id;
  await call("quote_status", { id: q, status: "Accepted" });
  const sizeOrder = (await call("convert_quote", { id: q })).id;
  const configured = (await asUser(db, OWNER, (tx) => tx.query(
    "select configure_order_sizes($1,$2::text[],$3) as form",
    [sizeOrder, ["Hoodie", "T-shirt"], true],
  ))).rows[0].form;
  assert.equal(configured.items.length, 2);
  const shared = (await asUser(db, null, (tx) => tx.query(
    "select shared_order_sizes($1::uuid) as form", [configured.share_token],
  ))).rows[0].form;
  assert.equal(shared.order_ref.startsWith("O-"), true);
  await assert.rejects(asUser(db, null, (tx) => tx.query(
    "select count(*)::int n from order_size_forms",
  )), /permission denied/);
  const entry = { id: id(), item: "Hoodie", name: "Madhav Gandhi",
    phone: "07668484377", print_name: "MADHAV", size: "M" };
  await assert.rejects(asUser(db, null, (tx) => tx.query(
    "select save_order_sizes($1::uuid,$2::jsonb,$3)",
    [configured.share_token, JSON.stringify([{ ...entry, item: "Unknown" }]), 0],
  )), /Complete each name and size/);
  const result = (await asUser(db, null, (tx) => tx.query(
    "select save_order_sizes($1::uuid,$2::jsonb,$3) as result",
    [configured.share_token, JSON.stringify([entry]), 0],
  ))).rows[0].result;
  assert.equal(result.version, 1);
  await assert.rejects(asUser(db, null, (tx) => tx.query(
    "select save_order_sizes($1::uuid,$2::jsonb,$3)",
    [configured.share_token, JSON.stringify([]), 0],
  )), /changed elsewhere/);
  const saved = (await asUser(db, OWNER, (tx) => tx.query(
    "select entries from order_size_forms where order_id=$1", [sizeOrder],
  ))).rows[0].entries;
  assert.equal(saved[0].phone, "07668484377");
  await asUser(db, OWNER, (tx) => tx.query(
    "select configure_order_sizes($1,$2::text[],$3)",
    [sizeOrder, ["Hoodie", "T-shirt"], false],
  ));
  assert.equal((await asUser(db, null, (tx) => tx.query(
    "select shared_order_sizes($1::uuid) as form", [configured.share_token],
  ))).rows[0].form, null);
  const reopened = (await asUser(db, OWNER, (tx) => tx.query(
    "select configure_order_sizes($1,$2::text[],$3) as form",
    [sizeOrder, ["Hoodie", "T-shirt"], true],
  ))).rows[0].form;
  assert.notEqual(reopened.share_token, configured.share_token);
  assert.equal(reopened.entries.length, 1);
});
console.log(`${passed} database scenarios passed`);
await db.close();
