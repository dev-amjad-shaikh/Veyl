---
title: Nobody reads the policy
subtitle: What I learned building a tool to check whether websites do what they say — starting with the discovery that my tool didn't.
date: 2026-08-24
---

There is a page on the internet, on a site you have probably used, where you type
your name and your address and sometimes your card details. While you do that, a
service called a session recorder is capturing your mouse, your scrolling, and
your keystrokes, so that someone can watch a video of you filling it in later.

This is not a secret. It is not a hack. The site pays for it, on purpose, to
improve conversion rates. The recording tool offers a setting to mask sensitive
fields, and the site is supposed to switch it on.

What struck me, when I started looking, was not that this happens. It was that
the site's privacy policy does not mention it at all.

## The asymmetry is not secrecy

We talk about online privacy as though the problem were concealment — as though
companies were hiding what they do, and the job is to expose it.

Mostly they are not hiding. They publish it. Every site has a policy, and the
policy is usually reasonably honest about the shape of what happens: data is
collected, partners are involved, adverts are personalised. The document is right
there, linked from the footer, freely available to anyone.

It is also, on the sites I looked at, about an hour's reading. One ran to
thirty-four thousand words. And you are asked to accept it in the two seconds
before a banner gets out of the way of the thing you actually came for.

So the asymmetry is not that they hide it. The asymmetry is that they can write
anything, at any length, and be confident that nobody will ever hold the document
next to the behaviour. The promise is not concealed. It is simply never checked.

That is a strange kind of consent. It has the legal form of agreement and none of
the substance, and everyone involved knows it.

## What I actually wanted to know

I did not want another tool that told me a site was tracking me. I already knew
that. Every site is tracking me, the extensions that tell me so have been telling
me so for fifteen years, and the number they show me — nineteen trackers, thirty
trackers — has stopped meaning anything.

What I wanted was narrower and, I think, more useful: **does this site do what it
says it does?**

That question has a shape a computer can work with. The claim is in the policy.
The behaviour is in the browser. You can hold them next to each other. And unlike
a tracker count, the answer tells you something about the people running the site
— whether the document is a description of their practice or a shield against it.

So I built that. It reads the site's policy on your machine, watches what the page
actually does, and reports where the two disagree.

## Then it lied to me

The first time I ran it across a few dozen real websites, it told me that the
Guardian's privacy policy does not say your data is shared with third parties.

The Guardian's privacy policy says that. Of course it does. What had happened was
that my tool had followed a link marked "privacy", landed on a page that turned
out to be a settings hub, found about a thousand words of nothing in particular,
extracted no claims from it, and then reported the absence of claims as the
absence of a promise.

It had not read the policy. It said the policy was silent.

I want to be precise about why this bothered me so much, because it is the whole
point. The mistake was not a bug in the parsing. The mistake was a category error:
treating *I did not find it* as *it is not there*. My tool had done, in one step,
exactly what the entire genre of privacy scare-reporting does — taken a gap in its
own knowledge and presented it to a reader as a finding about someone else.

And it was persuasive. It was rendered in red, in a panel, next to a real
observation that was true. That is what makes it dangerous. A false claim
travelling in the company of true ones inherits their credibility.

## It happened twice more

I fixed it, and ran the study again, and this time I was the one making the error.

Roughly a dozen well-known shops appeared to contact no tracking companies at all.
I nearly published that as the good news in the piece — look, some retailers wait
for consent. Then I checked their pages and found no privacy links, no cookie
links, none of the furniture every retail site has in its footer. They had not
loaded. Their bot protection had served my browser a challenge page, and I had
been measuring the challenge page.

Same error, one level up. Absence of observation, dressed as observation.

Then a third time, smaller: I had told the tool to stay quiet unless it had
understood a document, and defined "understood" as having extracted at least one
claim. A consumer magazine's policy yielded exactly one claim from under seven
hundred words, cleared that bar, and produced a confident statement about what
the policy failed to disclose.

Three rounds. Each one the same mistake wearing a different hat.

## Why I think this matters more than the findings

There are findings. Only one site out of the several dozen I looked at contacted
nothing at all, and it was gov.uk. One publisher's front page reached forty-three
separate companies before I had clicked anything. Almost every site sets an
identifier that outlives the year. Very few policies say how long anything is
kept.

Those are worth knowing. But they are not, I think, the interesting part, because
they confirm what you already suspected, and confirmation is cheap.

The interesting part is how easy it was — building a tool whose entire stated
purpose is not to overclaim, with a design deliberately organised around not
overclaiming — to overclaim three times in a fortnight. Not through carelessness.
Through the ordinary, sensible-seeming step of treating silence as an answer.

Privacy tooling has an incentive problem here that nobody talks about. Alarming
claims are shareable. Careful ones are not. A tool that says *this site sends your
data to twelve advertisers* gets installed; a tool that says *I could not read
this site's policy, so I cannot tell you whether it discloses that* gets called
useless. Nobody audits the auditor, and the auditor knows it.

So the discipline I ended up caring about most is not technical. It is holding two
distinctions that feel pedantic and are not:

> Nothing seen is not nothing. If a tool watched and found no fingerprinting, that
> is a statement about the tool's attention, not about the site's conduct.

> Could not read is not does not say. If a document was not understood, nothing
> whatsoever follows about what is in it.

Both of those cost you the punchy version of the sentence. Both of them are the
difference between evidence and accusation.

## What is left

The thing I keep returning to is the session recorder on the checkout page.

Not because it is the worst thing I found — it is not. Because it is so
comprehensively ordinary. A reputable company bought a reasonable tool for a
reasonable purpose, did not switch on the masking, and did not update the document
that is supposed to tell you what happens to you there. No villain. No conspiracy.
Just a promise that nobody, in the entire chain, was ever going to check.

That is the actual condition of the thing. Not surveillance so much as an
enormous, sincere, unread stack of paper, and a great deal of behaviour underneath
it that has never once been held up against it.

You should be able to hold it up. It should take a second, not an hour, and it
should be done on your own machine by something that has no reason to tell you
anything but what it saw.

That is what I built. It is free, the source is public, and it will tell you when
it does not know.
