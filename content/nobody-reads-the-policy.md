---
title: Nobody reads the policy
subtitle: I built something to check whether websites do what their privacy policies say. It was wrong three times before they were.
date: 2026-08-24
---

Rightmove runs Hotjar on its site. Hotjar records your session — mouse, scrolling,
keystrokes — so someone can watch it back later. It has a setting for masking
sensitive fields and I have no idea whether Rightmove has it switched on.

Rightmove's privacy policy runs to about twenty-four thousand words. It does not
mention session recording.

I am not picking on Rightmove. Ars Technica does the same thing, so does Gumtree,
so does TechCrunch, so does the i. ASOS uses Contentsquare instead. None of their
policies mention it either. This is just what the web does now, and I only know
because I spent a fortnight building something to look.

## The bit that surprised me

I expected to find things being hidden. That's the shape of every privacy story
you've ever read — the exposé, the leak, the thing they didn't want you to see.

That isn't what's happening. The Express publishes a privacy policy of
thirty-four thousand words. Thirty-four thousand. It's all in there, more or less;
data collected, partners involved, adverts personalised. Nobody is concealing
anything. They've written it down and put a link to it in the footer.

They've also worked out, correctly, that you will never read it. So the document
can say whatever is most convenient, and the behaviour underneath it can be
whatever is most profitable, and the two need never be introduced to each other.

Which is a strange arrangement to have built the entire legal edifice of online
consent on top of.

I wanted to introduce them. Not "is this site tracking me" — obviously it is, every
site is, the number has meant nothing for a decade. The narrower question: does
this site do the thing it says it does? That one you can actually answer. The claim
is in the policy, the behaviour is in the browser, and a computer can hold them
next to each other.

## My tool lied about the Guardian

First proper run, forty-odd sites. Near the top of the output:

**The Guardian's privacy policy does not say that your data is shared with third
parties.**

It does say that. It obviously says that; it's a national newspaper with a legal
department. What had happened is that my code followed a footer link marked
"privacy", landed on some kind of settings hub, scraped about thirteen hundred
words of navigation furniture off it, matched none of its patterns against any of
that, and concluded from finding nothing that there was nothing to find.

The real policy is nine and a half thousand words long. My tool had read fifteen
percent of it and then made an announcement about the rest.

That's not a parsing bug, or not only. It's the exact move that every bad privacy
story is built on, and every AI-detector, and every content-moderation false
positive: I looked, I didn't see it, therefore it isn't there. What made it worse
is that the false line sat directly underneath a true one — a real observation
about real trackers — and borrowed its authority.

## Then I did it myself

Fixed it. Ran it again. Got a much better result and a lovely finding: a dozen
big retailers — Argos, ASOS, Boots, Etsy, Next — appeared to load with no tracking
companies at all. Sites that wait for consent! I started drafting the paragraph.

Then I looked at the pages. No cookie link, no privacy link, no footer at all.
Every retail site on earth has those. What I'd been measuring was the bot-blocking
challenge page their CDN serves to anything that announces itself as headless
Chrome, and I'd faithfully recorded that it contained no trackers, which it
didn't, because it wasn't a shop.

Same error as before, one level up. I'd fixed it in the code and immediately
repeated it in the research.

There was a third, smaller one. After the Guardian I'd told the tool to keep quiet
unless it had understood a document, and defined "understood" as extracting at
least one claim from it. Which?'s policy gave up a single claim from under seven
hundred words — which is not comprehension, it's a coin landing on its edge — and
on that basis the tool announced what Which? had failed to disclose. Now it wants
claims about at least two different subjects before it will say a document omits
anything.

Three times in two weeks. I'd like to report that I caught them through rigour.
I caught all three because the results looked too good.

## What I think this is actually about

There is a real incentive problem in privacy tooling and nobody in it talks about
it much.

Alarming claims travel. "This site sends your data to twelve advertisers" is a
screenshot people share. "I could not read this site's policy, so I can't tell you
whether it discloses that" is not. One of those gets you installs. And crucially,
nobody audits the auditor — there is no equivalent of the tool I built, pointed at
the tool I built.

So the pressure runs one way, always, towards the confident version of the
sentence. Which is how you end up with an extension that tells forty million
people something untrue about the Guardian, and nobody ever finds out, including
the person who wrote it.

Two distinctions came out of this that sound pedantic until they cost you
something:

> Nothing seen is not nothing. If the tool watched and found no fingerprinting,
> that's a fact about the tool's attention, not the site's conduct.

> Could not read is not does not say. If a document wasn't understood, nothing
> whatsoever follows about what's in it.

Both of them make the output weaker and less quotable. Both are the entire
difference between evidence and accusation.

## The findings, briefly

Since you'll want them. Of the sites that actually loaded, exactly one contacted
no tracking company at all, and it was gov.uk. The Verge's front page reached
forty-three separate companies and set fifty-two cookies before I touched
anything. Thirty-six of thirty-eight sites left an identifier that outlives the
year. Five policies out of thirty-three said how long anything is kept; the BBC's
doesn't, the Guardian's doesn't, Reuters' doesn't.

Take those as you like. They're the least surprising part of the exercise and I
don't think they change anyone's mind.

## The bit I can't stop thinking about

It's still Rightmove, and the recorder, and the twenty-four thousand words that
don't mention it.

There's no villain in that. Somebody in growth bought a normal tool for a normal
reason. Somebody else maintains the privacy policy, on a different team, probably
with a lawyer, probably a year ago. Nobody did anything wrong exactly, and the
result is a page where you look at houses you can't afford while a video is made
of you doing it, described by a document that doesn't know.

You should be able to check. It should take a second, not an hour, and the thing
doing the checking should have no reason on earth to tell you anything except what
it saw — including, when it comes to it, that it couldn't see.

That's what I built. It's free, the source is public, and it will tell you when it
doesn't know.
