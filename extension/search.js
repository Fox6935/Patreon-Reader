(() => {
  const root = (window.PRH = window.PRH || {});

  // Google-flavored query subset:
  //   foo bar      implicit AND (every group must match)
  //   foo -bar     exclusion (AND-NOT), applied after OR-groups resolve
  //   "foo bar"    exact phrase (spaces kept literal)
  //   foo OR bar   OR; `|` is an alias. OR binds tighter than the implicit AND,
  //                so `a b OR c` means `a AND (b OR c)`.
  // OR must be uppercase to be an operator; lowercase "or" is a literal term.
  // Exclusions never participate in OR: `cat OR -dog` means `cat AND NOT dog`,
  // not `{has cat} OR {lacks dog}`. A query with no include term at all
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

    // Exclusions are pulled out of the OR/AND group lattice entirely: a
    // `-term` is a global AND-NOT applied after the positive OR-groups resolve,
    // never a broadening member of an OR group. This keeps `-term` narrowing
    // semantics consistent regardless of where in the query it appears.
    const groups = [];
    const excludes = [];
    let joinPrev = false;
    for (const t of tokens) {
      if (t.op === "or") {
        joinPrev = groups.length > 0;
        continue;
      }
      if (t.exclude) {
        excludes.push(t.value);
        joinPrev = false;
        continue;
      }
      if (joinPrev) {
        groups[groups.length - 1].push(t);
        joinPrev = false;
      } else {
        groups.push([t]);
      }
    }
    return { groups, excludes };
  }

  function matchHaystack(haystack, parsed) {
    const { groups, excludes } = parsed;
    if (groups.length === 0) return true;
    const hay = String(haystack || "").toLowerCase();
    for (const ex of excludes) {
      if (hay.includes(ex)) return false;
    }
    for (const group of groups) {
      if (!group.some((t) => hay.includes(t.value))) return false;
    }
    return true;
  }

  function matchesQuery(haystack, query) {
    return matchHaystack(haystack, parseQuery(query));
  }

  root.search = { parseQuery, matchHaystack, matchesQuery };
})();