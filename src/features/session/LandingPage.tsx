import { ProjectLinks } from '../../shared/project-links';
import { BrandLogo } from '../../shared/brand-logo';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Button } from '../../shared/ui/button';

function ConnectionGraph() {
  const [extended, setExtended] = useState(false);
  const captionId = useId();
  return (
    <figure className="landing-network" data-extended={extended}>
      <div className="network-heading">
        <span>Connection starts with someone you know.</span>
        <span className="network-mark" aria-hidden="true">
          <BrandLogo compact />
        </span>
      </div>
      <svg
        viewBox="0 0 480 390"
        role="img"
        aria-label={
          extended
            ? 'You connect to three friends, whose connections introduce you to friends of friends.'
            : 'Your circle starts with you and the friends you choose to add.'
        }
      >
        <g className="network-guides" aria-hidden="true">
          <circle cx="233" cy="205" r="100" />
          <circle cx="233" cy="205" r="176" />
          <path d="M233 14v12m0 358v-12M41 205h12m360 0h12" />
        </g>
        <g className="network-extended" aria-hidden="true">
          <path
            className="network-edge"
            d="M152 146 97 56M152 146 37 153M322 160 381 62M322 160 436 187M260 299 391 327M260 299 148 354"
          />
          <circle cx="97" cy="56" r="13" />
          <circle cx="37" cy="153" r="9" />
          <circle cx="381" cy="62" r="12" />
          <circle cx="436" cy="187" r="9" />
          <circle cx="391" cy="327" r="15" />
          <circle cx="148" cy="354" r="10" />
        </g>
        <g className="network-close" aria-hidden="true">
          <path className="network-edge" d="M233 205 152 146M233 205 322 160M233 205 260 299" />
          <circle cx="152" cy="146" r="24" />
          <circle cx="322" cy="160" r="24" />
          <circle cx="260" cy="299" r="24" />
          <path
            className="network-person"
            d="M144 152q8-12 16 0m-8-17a4 4 0 1 0 0 8 4 4 0 0 0 0-8M314 166q8-12 16 0m-8-17a4 4 0 1 0 0 8 4 4 0 0 0 0-8M252 305q8-12 16 0m-8-17a4 4 0 1 0 0 8 4 4 0 0 0 0-8"
          />
        </g>
        <circle cx="233" cy="205" r="38" className="network-self" />
        <text x="233" y="210" textAnchor="middle" className="network-self-label">
          You
        </text>
        <text x="137" y="111" textAnchor="middle" className="network-node-label">
          Your friends
        </text>
        <text
          x="372"
          y="33"
          textAnchor="middle"
          className="network-node-label network-extended-label"
        >
          Their friends
        </text>
      </svg>
      <div className="network-controls" role="group" aria-label="Explore the social graph">
        <Button
          variant={extended ? 'ghost' : 'secondary'}
          aria-pressed={!extended}
          aria-controls={captionId}
          onClick={() => setExtended(false)}
        >
          Your friends
        </Button>
        <Button
          variant={extended ? 'secondary' : 'ghost'}
          aria-pressed={extended}
          aria-controls={captionId}
          onClick={() => setExtended(true)}
        >
          Friends of friends
        </Button>
      </div>
      <figcaption id={captionId} aria-live="polite">
        {extended
          ? 'A mutual friend gives a new connection a familiar starting point.'
          : 'Add the people you know. This is the circle you build together.'}
      </figcaption>
    </figure>
  );
}

export function LandingPage() {
  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>
      <header className="landing-header">
        <Link to="/" className="wordmark" aria-label="Friendly home">
          <BrandLogo />
        </Link>
        <nav className="landing-nav" aria-label="About Friendly">
          <a href="#why-friendly">The idea</a>
          <Button asChild variant="outline">
            <Link to="/login">
              Sign in <ArrowUpRight />
            </Link>
          </Button>
        </nav>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-copy">
            <p className="landing-intro">
              <span aria-hidden="true" />A social network without recommendations.
            </p>
            <h1 id="landing-title">
              A little closer <br />
              to your people.
            </h1>
            <p className="landing-description">
              Your friends. Their friends. The things you have in common. Friendly is a place to
              grow those connections and keep the conversation going.
            </p>
            <Button asChild className="landing-cta">
              <Link to="/signup">
                Join Friendly <ArrowRight />
              </Link>
            </Button>
            <p className="landing-entry-note">Start with a profile. Bring someone you know.</p>
          </div>
          <ConnectionGraph />
          <a className="landing-read-on" href="#why-friendly">
            A smaller world. More room for connection.
            <ArrowDown size={16} />
          </a>
        </section>

        <section className="landing-purpose" id="why-friendly" aria-labelledby="purpose-title">
          <div className="landing-section-label">Why Friendly exists</div>
          <div className="purpose-heading">
            <h2 id="purpose-title">
              Being connected <br />
              should feel personal.
            </h2>
            <p className="purpose-lead">
              Some of the best people to meet are already one friendship away.
            </p>
          </div>
          <div className="purpose-copy">
            <p>
              You already have a network: friends, classmates, colleagues, and people you keep
              meaning to catch up with. Friendly gives those relationships a place to grow.
            </p>
            <p>
              Your connections shape who you meet. Add a friend, explore your shared circle, and
              find people through the interests and friendships you already have.
            </p>
            <div className="purpose-principle">
              <span className="principle-line" aria-hidden="true" />
              <p>
                <strong>You choose your circle.</strong>
                <br />
                Friendship is mutual. Every new connection is a choice you make together.
              </p>
            </div>
          </div>
        </section>

        <section className="landing-founder" aria-labelledby="founder-title">
          <div className="founder-story">
            <h2 id="founder-title">A personal reason to keep building.</h2>
            <p>
              Friendly was already in development when its creator briefly lost access to Telegram.
              His friends, family, and communities were suddenly out of reach. That experience made
              the purpose more personal: give existing relationships another place to live.
            </p>
            <a
              href="https://github.com/friendly-social/knowledge/blob/main/IDEA.md"
              target="_blank"
              rel="noreferrer"
            >
              Read the project’s idea <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="founder-quote">
            <span className="quote-mark" aria-hidden="true">
              “
            </span>
            <blockquote>Our focus is on enhancement of existing local networks.</blockquote>
            <p>
              Aλex Meta<span>Creator of Friendly · March 2026</span>
            </p>
          </div>
        </section>

        <section className="landing-use" aria-labelledby="use-title">
          <div className="use-intro">
            <span className="landing-section-label">A place for everyday things</span>
            <h2 id="use-title">
              Make yourself <br />
              at home.
            </h2>
            <p>A question. A weekend plan. A photo you want to share with your people.</p>
          </div>
          <div className="use-details">
            <article>
              <span className="use-marker" aria-hidden="true" />
              <div>
                <h3>Bring a familiar face.</h3>
                <p>
                  Share an invitation link or QR code. Once your friend joins, you can add each
                  other to your circle.
                </p>
              </div>
            </article>
            <article>
              <span className="use-marker" aria-hidden="true" />
              <div>
                <h3>Give the conversation a place.</h3>
                <p>
                  Write a post, share photos, video or audio, and pick up the conversation in
                  replies.
                </p>
              </div>
            </article>
            <article>
              <span className="use-marker" aria-hidden="true" />
              <div>
                <h3>Let your circle open a little.</h3>
                <p>
                  Explore friends of friends and shared interests. A new friendship can start with a
                  connection you already have.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-outlook" aria-labelledby="outlook-title">
          <div>
            <h2 id="outlook-title">
              Built in the open. <br />
              Growing with its community.
            </h2>
            <p>
              Friendly is an open-source project built by people alongside work, study, and life.
              The goal is a useful place to communicate with your people. The community helps shape
              what comes next.
            </p>
          </div>
          <div className="outlook-links">
            <a href="https://github.com/friendly-social" target="_blank" rel="noreferrer">
              Explore the source <ArrowUpRight size={18} />
            </a>
            <a
              href="https://github.com/friendly-social/knowledge/discussions"
              target="_blank"
              rel="noreferrer"
            >
              Join the discussion <ArrowUpRight size={18} />
            </a>
          </div>
        </section>

        <section className="landing-join" aria-labelledby="join-title">
          <div>
            <p>Your circle starts with one connection.</p>
            <h2 id="join-title">Who will you bring?</h2>
          </div>
          <div className="join-actions">
            <Button asChild className="landing-cta">
              <Link to="/signup">
                Create your profile <ArrowRight />
              </Link>
            </Button>
            <p>
              Have an invitation? Open your friend’s link. <br />
              You can accept it after signing in.
            </p>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <span>Friendly Client · Part of the Friendly network</span>
        <div className="landing-footer-links">
          <ProjectLinks />
          <a href="https://getfriend.ly" target="_blank" rel="noopener noreferrer">
            getfriend.ly <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </footer>
    </div>
  );
}
