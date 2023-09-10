const { User } = require("../../models/user");
const {
  cntrlWrappers,
  HttpError,
  createHashPassword,
  checkHashPassword,
  sendEmail,
} = require("../../helpers");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const gravatar = require("gravatar");
const { SECRET_KEY, BASE_URL } = process.env;
const path = require("path");
const avatarsDir = path.join(__dirname, "../", "../", "public", "avatars");
const fs = require("fs/promises");
const Jimp = require("jimp");
const { nanoid } = require("nanoid");

const resendVerificateToken = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "missing required field email" });
  }

  const user = await User.findOne({ email });
  console.log("Example", user);
  console.log("email", email);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  if (user.verify) {
    return res
      .status(400)
      .json({ message: "Verification has already been passed" });
  }

  const verifyEmail = {
    to: email,
    subject: "Verify email",
    html: `<a target="_blank" href="${BASE_URL}/api/user/verify/${user.verificationToken}"> Click to verify email</a> `,
  };

  await sendEmail(verifyEmail);

  res.status(200).json({ message: "Verification email sent" });
};

const verificate = async (req, res) => {
  const verificationToken = req.params.verificationToken;
  console.log("Example", verificationToken);

  const user = await User.findOne({ verificationToken });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  await User.findOneAndUpdate(
    { verificationToken },
    { verify: true, verificationToken: null }
  );

  res.status(200).json({ message: "Verification successful" });
};

const register = async (req, res, next) => {
  const { password, email } = req.body;
  const avatarURL = gravatar.url(email);
  const verificationToken = nanoid();

  const user = await User.findOne({ email });

  if (user) {
    throw HttpError(409, "Email in use");
  }

  const hashPassword = await createHashPassword(password);

  const newUser = await User.create({
    ...req.body,
    password: hashPassword,
    avatarURL,
    verificationToken,
  });

  const verifyEmail = {
    to: email,
    subject: "Verify email",
    html: `<a target="_blank" href="${BASE_URL}/api/user/verify/${verificationToken}"> Click to verify email</a> `,
  };

  await sendEmail(verifyEmail);

  res.status(201).json({
    user: {
      email: newUser.email,
      password: newUser.password,
    },
  });
};

const login = async (req, res, next) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    throw HttpError(401, "Email or password is wrong");
  }

  if (!user.verify) {
    throw HttpError(401, "Email not verify");
  }

  const correctPassword = await checkHashPassword(password, user.password);

  if (!correctPassword) {
    res.status(401).json({ message: "Email or password is wrong" });
  }

  const payload = {
    id: user._id,
  };

  const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "23h" });
  await User.findByIdAndUpdate(user._id, { token });

  res.status(200).json({
    token: token,
    user: {
      email: user.email,
      subscription: "starter",
    },
  });
};

const currentUser = async (req, res, next) => {
  const { email, subscription } = req.user;

  res.json({ email, subscription });
};

const logOut = async (req, res) => {
  const { _id } = req.user;

  await User.findByIdAndUpdate(_id, { token: "" });

  res.status(204).json({});
};

const updateSubscription = async (req, res) => {
  const subscription = req.body.subscription;
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { subscription }, { runValidators: true });
  res.status(200).json({ message: `Update subscription to ${subscription}` });
};

const updateAvatar = async (req, res, next) => {
  const { _id } = req.user;

  const { path: tempUpload, filename } = req.file;

  const resultUpload = path.join(avatarsDir, filename);

  await fs.rename(tempUpload, resultUpload);

  Jimp.read(resultUpload)
    .then((avatar) => {
      return avatar
        .resize(256, 256) // resize
        .write(`public/avatars/avatar_${_id}.jpg`); // save
    })
    .then(() => {
      fs.unlink(resultUpload);
    })
    .catch((err) => {
      console.error(err);
    });

  const avatarURL = path.join(`public/avatars/avatar_${_id}.jpg`);

  await User.findByIdAndUpdate(_id, { avatarURL });

  res.json({ avatarURL });
};

module.exports = {
  register: cntrlWrappers(register),
  login: cntrlWrappers(login),
  currentUser: cntrlWrappers(currentUser),
  logOut: cntrlWrappers(logOut),
  updateSubscription: cntrlWrappers(updateSubscription),
  updateAvatar: cntrlWrappers(updateAvatar),
  verificate: cntrlWrappers(verificate),
  resendVerificateToken: cntrlWrappers(resendVerificateToken),
};
