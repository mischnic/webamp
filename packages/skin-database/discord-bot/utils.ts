import {
  RichEmbed,
  User,
  MessageReaction,
  TextChannel,
  DMChannel,
  GroupDMChannel,
} from "discord.js";
import rgbHex from "rgb-hex";
import * as Skins from "../data/skins";
import logger from "../logger";
import { TweetStatus } from "../types";

function isEligableToApprove(user: User): boolean {
  return !user.bot;
}

const filter = (reaction: MessageReaction): boolean => {
  const hasNonBot = reaction.users.some(isEligableToApprove);

  return (
    hasNonBot &&
    ["👍", "👎", "👏", "😔", "🔞"].some((name) => reaction.emoji.name === name)
  );
};

export async function postSkin({
  md5,
  title: _title,
  dest,
}: {
  md5: string;
  title?: (filename: string | null) => string;
  dest: TextChannel | DMChannel | GroupDMChannel;
}) {
  console.log("postSkin...");
  const skin = await Skins.getSkinByMd5_DEPRECATED(md5);
  if (skin == null) {
    console.warn("Could not find skin for md5", { md5, alert: true });
    logger.warn("Could not find skin for md5", { md5, alert: true });
    return;
  }
  const {
    canonicalFilename,
    screenshotUrl,
    skinUrl,
    averageColor,
    emails,
    tweetUrl,
    twitterLikes,
    tweetStatus,
    internetArchiveUrl,
    internetArchiveItemName,
    readmeText,
    nsfw,
    museumUrl,
  } = skin;
  const title = _title ? _title(canonicalFilename) : canonicalFilename;

  const embed = new RichEmbed()
    .setTitle(title)
    .addField("Try Online", `[skins.webamp.org](${museumUrl})`, true)
    .addField("Download", `[${canonicalFilename}](${skinUrl})`, true)
    .addField("Md5", md5, true);

  if (nsfw) {
    embed.addField("NSFW", `🔞`, true);
  }

  // @ts-ignore
  if (nsfw && !(dest.type === "text" && dest.nsfw)) {
    embed.addField("Screenshot", `[Screenshot](${screenshotUrl})`, true);
  } else {
    embed.setImage(screenshotUrl);
  }

  if (readmeText) {
    // Trim the readme since Discord will reject it otherwise.
    embed.setDescription(`\`\`\`${readmeText.slice(0, 2000)}\`\`\``);
  }
  if (averageColor) {
    try {
      const color = rgbHex(averageColor);
      if (String(color).length === 6) {
        embed.setColor(`#${color}`);
      } else {
        logger.warn("Did not get a safe color", {
          averageColor,
          color,
          warn: true,
        });
      }
    } catch (e) {
      logger.error("Could not use color", { averageColor, alert: true });
    }
  }
  if (emails != null && emails.length) {
    embed.addField("Emails", emails.join(", "), true);
  }
  if (tweetUrl != null) {
    let likes = "";
    if (twitterLikes != null) {
      likes = `(${Number(twitterLikes).toLocaleString()} likes) `;
    }
    embed.addField("Tweet Status", `[Tweeted](${tweetUrl}) ${likes}🐦`, true);
  } else {
    if (tweetStatus === "UNREVIEWED") {
      embed.setFooter(
        "React with 👍 or 👎 to approve or deny or 🔞 to mark NSFW"
      );
    }
    embed.addField("Tweet Status", getPrettyTwitterStatus(tweetStatus), true);
  }
  if (internetArchiveUrl) {
    embed.addField(
      "Internet Archive",
      `[${internetArchiveItemName || "Permalink"}](${internetArchiveUrl})`,
      true
    );
  }

  // @ts-ignore WAT?
  const msg = await dest.send(embed);
  if (tweetStatus !== "UNREVIEWED") {
    return;
  }

  // Don't await
  Promise.all([msg.react("👍"), msg.react("👎"), msg.react("🔞")]);
  // TODO: Timeout at some point
  await msg.awaitReactions(filter, { max: 1 }).then(async (collected) => {
    const vote = collected.first();
    const user = vote.users.find(isEligableToApprove);
    switch (vote.emoji.name) {
      case "👍":
      case "👏":
        await Skins.approve(md5);
        logger.info(`${user.username} approved ${md5}`);
        await msg.channel.send(
          `${canonicalFilename} was approved by ${user.username}`
        );
        msg.react("✅");
        break;
      case "😔":
      case "👎":
        await Skins.reject(md5);
        logger.info(`${user.username} rejected ${md5}`);
        await msg.channel.send(
          `${canonicalFilename} was rejected by ${user.username}`
        );
        msg.react("❌");
        break;
      case "🔞":
        logger.info(`${user.username} marked ${md5} as NSFW`);
        await Skins.markAsNSFW(md5);
        await msg.channel.send(
          `${canonicalFilename} was marked as NSFW by ${user.username}`
        );
        await Skins.reject(md5);
        logger.info(`${user.username} rejected ${md5}`);
        await msg.channel.send(
          `${canonicalFilename} was rejected by ${user.username}`
        );
        msg.react("❌");
        break;
      default:
        logger.alert(
          `Unknown skin reaction by ${user.username} on ${md5}: ${vote.emoji.name}`
        );
    }
  });
}

function getPrettyTwitterStatus(status: TweetStatus): string {
  switch (status) {
    case "APPROVED":
      return "Approved ✅";
    case "REJECTED":
      return "Rejected ❌";
    case "UNREVIEWED":
      return "Unreviewed ❔";
    case "TWEETED":
      return "Tweeted 🐦";
  }
}

export async function sendAlreadyReviewed({
  md5,
  dest,
}: {
  md5: string;
  dest: TextChannel | DMChannel | GroupDMChannel;
}) {
  const skin = await Skins.getSkinByMd5_DEPRECATED(md5);
  if (skin == null) {
    console.warn("Could not find skin for md5", { md5, alert: true });
    logger.warn("Could not find skin for md5", { md5, alert: true });
    return;
  }
  const { canonicalFilename, museumUrl, tweetStatus, nsfw } = skin;

  const embed = new RichEmbed()
    .setTitle(
      `Someone flagged "${canonicalFilename}", but it's already been reviwed.`
    )
    .addField("Status", getPrettyTwitterStatus(tweetStatus), true)
    .addField("Museum", `[${canonicalFilename}](${museumUrl})`, true);

  if (nsfw) {
    embed.addField("NSFW", `🔞`, true);
  }

  dest.send(embed);
}
