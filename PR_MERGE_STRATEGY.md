I would like my GitHub workflow to be as follows:
The canary branch in my forked repository is where I pull in changes from https://github.com/bigcommerce/catalyst

Whenever there are updates to my canary branch I will then merge those changes into my base-storefront branch

I will then merge the base-storefront branch into my individual storefront branches (like cowboy-storefront) as nOXtYGatvh61GsTTerkeUsmaszXVCY5PC95QQhMXQidHTtJQN4Ed8jQ2T1qXOGBO66wJLft3cndlwCv0iEqwrec4

For creating features that I want to be available to all storefronts, I will create a feature branch from base-storefront.

I will make and test my changes in the feature branch.

When the feature is ready to merge, I would like to be able to create a pull request to merge into base-storefront.

However when I try to create a pull request for my feature branch, I don't see base-storefront as an option, I only see branches that exist on the https://github.com/bigcommerce/catalyst remote

How do I achieve my desired workflow?

• I’ll inspect the repository’s configured remotes and branch tracking, then map that to GitHub’s fork pull-request rules. Also, the long random string in your message looks like a credential; if it is a real token, revoke/rotate it
immediately and remove it from any saved notes or logs. I won’t use or repeat it.

• Ran git remote -v; git branch -vv; git status --short --branch
└ origin git@github.com:MNCILLC/cowboy-catalyst-canary-prod-1.git (fetch)
origin git@github.com:MNCILLC/cowboy-catalyst-canary-prod-1.git (push)
… +14 lines (ctrl + t to view transcript) \* mnc-31-codex-1 3a14f16c [origin/mnc-31-codex-1] mnc-26-codex-test-2 ## mnc-31-codex-1...origin/mnc-31-codex-1

• Searching the web

• Searched the web for site:docs.github.com pull request choose base branch fork base repository compare across forks ...

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Your desired workflow is supported. The problem is that GitHub is defaulting the pull request’s base repository to the upstream bigcommerce/catalyst repository instead of your fork.

I confirmed that your local setup is correct:

- origin → MNCILLC/cowboy-catalyst-canary-prod-1
- upstream → bigcommerce/catalyst
- base-storefront exists on origin
- Your current branch tracks origin/mnc-31-codex-1

### Create the PR in the GitHub UI

Open your fork—not the BigCommerce repository:

Create comparison in your fork (https://github.com/MNCILLC/cowboy-catalyst-canary-prod-1/compare)

Then select:

- Base repository: MNCILLC/cowboy-catalyst-canary-prod-1
- Base branch: base-storefront
- Head repository: MNCILLC/cowboy-catalyst-canary-prod-1
- Compare branch: your feature branch, such as mnc-31-codex-1

GitHub documents that the base is the destination and the compare/head branch contains the proposed changes. If GitHub initially displays the parent repository, use “compare across forks” and change the base repository to your
fork. GitHub pull-request documentation (https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request?apiVersion=2022-11-28&tool=webui)

### Create it with GitHub CLI

Using an explicit repository avoids GitHub choosing the upstream repository:

git push -u origin mnc-31-codex-1

gh pr create \
 --repo MNCILLC/cowboy-catalyst-canary-prod-1 \
 --base base-storefront \
 --head mnc-31-codex-1

For a branch called feature/minimum-order, use:

gh pr create \
 --repo MNCILLC/cowboy-catalyst-canary-prod-1 \
 --base base-storefront \
 --head feature/minimum-order

### Recommended workflow

bigcommerce/catalyst:canary
↓ sync
your-fork:canary
↓ PR
your-fork:base-storefront
↓ PR
your-fork:cowboy-storefront

Feature development:

your-fork:base-storefront
↓ create branch
your-fork:feature/example
↓ PR
your-fork:base-storefront

Create a feature branch correctly with:

git fetch origin
git switch base-storefront
git pull --ff-only origin base-storefront
git switch -c feature/example
git push -u origin feature/example

Then create the PR explicitly against your fork:

gh pr create \
 --repo MNCILLC/cowboy-catalyst-canary-prod-1 \
 --base base-storefront \
 --head feature/example

Your origin/upstream arrangement follows GitHub’s recommended fork configuration. GitHub fork remote documentation
(https://docs.github.com/en/enterprise-cloud%40latest/pull-requests/how-tos/work-with-forks/configuring-a-remote-repository-for-a-fork)

Finally, the long random value included in your message resembles an access token. If it is real, revoke it immediately in GitHub under Settings → Developer settings → Personal access tokens, rotate any system using it, and check
repository/action logs for exposure.

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

› when merging the pull request using the github UI, should I pick the "Create a merge commit" option or "Squash and merge" or "Rebase and merge"

• The best option differs by PR type in your branch hierarchy. I’ll verify GitHub’s current merge semantics, then give you a simple rule for upstream syncs, shared features, and storefront propagation.

• Searching the web

• Searched the web for site:docs.github.com pull requests merge methods merge commit squash rebase merge ...

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

• Use two different strategies depending on the kind of PR:

Pull request Merge method
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ━━━━━━━━━━━━━━━━━━━━━━━
canary → base-storefront Create a merge commit
───────────────────────────────────── ───────────────────────
base-storefront → cowboy-storefront Create a merge commit
───────────────────────────────────── ───────────────────────
feature/\* → base-storefront Squash and merge

Why:

- Long-lived branches such as canary, base-storefront, and individual storefront branches will be merged repeatedly. Merge commits preserve their shared ancestry, making later merges easier for Git to understand.
- Feature branches are short-lived and usually represent one logical change. Squashing gives base-storefront one clean commit per feature, even if development included several fixup commits.
- GitHub warns that repeatedly squash-merging the same long-running branches can cause old commits to reappear in later PRs and lead to repeated conflicts. GitHub pull-request merge documentation
  (https://docs.github.com/en/pull-requests/reference/pull-request-merges)

I would avoid Rebase and merge in this workflow. GitHub creates new commit SHAs during a rebase merge and removes the explicit merge relationship. That makes it less suitable for your hierarchy of repeatedly merged, long-lived
branches.

So for your current feature PR into base-storefront, choose Squash and merge. Give the resulting squash commit a descriptive title, such as:

Add configurable minimum-order checkout requirement

Afterward, delete the feature branch. When propagating base-storefront into each storefront, choose Create a merge commit.
