(() => {
  const root = (window.PRH = window.PRH || {});

  // Google-flavored query subset:
  //   foo bar      implicit AND (every group must match)
  //   foo -bar     exclusion
  //   "foo bar"    exact phrase (spaces kept literal)
  //   foo OR bar   OR; `|` is an alias. OR binds tighter than the implicit AND,
  //                so `a b OR c` means `a AND (b OR c)`.
  // OR must be uppercase to be an operator; lowercase "or" is a literal term.
  // Exclusions only refine a positive search: a query with no include term
  // (e.g. just `-foo`) acts as no filter rather than hiding matches.
  function parseQuery(query) {
    const s = String(query || "");
    const tokens = [];
    let i = 0;

    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === "|") {
        tokens.push({ op: "or" });
        i++;
        continue;
      }

      let exclude = false;
      if (ch === "-") {
        exclude = true;
        i++;
      }

      let value = "";
      if (s[i] === '"') {
        i++;
        while (i < s.length && s[i] !== '"') {
          value += s[i];
          i++;
        }
        if (s[i] === '"') i++;
      } else {
        while (i < s.length && !/\s/.test(s[i]) && s[i] !== "|") {
          value += s[i];
          i++;
        }
        if (!exclude && value === "OR") {
          tokens.push({ op: "or" });
          continue;
        }
      }

      if (value === "") continue;
      tokens.push({ value: value.toLowerCase(), exclude });
    }

    const groups = [];
    let joinPrev = false;
    for (const t of tokens) {
      if (t.op === "or") {
        joinPrev = groups.length > 0;
        continue;
      }
      if (joinPrev) {
        groups[groups.length - 1].push(t);
        joinPrev = false;
      } else {
        groups.push([t]);
      }
    }
    return groups;
  }

  function matchHaystack(haystack, groups) {
    if (!groups.some((g) => g.some((t) => !t.exclude))) return true;
    const hay = String(haystack || "").toLowerCase();
    for (const group of groups) {
      const ok = group.some((t) =>
        t.exclude ? !hay.includes(t.value) : hay.includes(t.value),
      );
      if (!ok) return false;
    }
    return true;
  }

  function matchesQuery(haystack, query) {
    return matchHaystack(haystack, parseQuery(query));
  }

  root.search = { parseQuery, matchHaystack, matchesQuery };
})();
