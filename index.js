const dotenv = require("dotenv");
dotenv.config(); // Load environment variables

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require('bcryptjs');

const app = express();
const port = process.env.PORT || 4000; // Use environment variable or fallback to 4000

app.use(express.json());
app.use(cors());

// Database connection with MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log("MongoDB connected");
}).catch((error) => {
    console.error("MongoDB connection error:", error);
});

// API Creation
app.get("/", (req, res) => {
    res.send("Express is Running");
});

// Ensure the upload directory exists
const uploadDir = path.join(__dirname, 'upload/images');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Image Storage Engine
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage: storage });

// Creating Upload Endpoint
app.use('/images', express.static(uploadDir));
app.post("/upload", upload.single('product'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: 0,
            message: "No file uploaded"
        });
    }
    res.json({
        success: 1,
        image_url: `http://localhost:${port}/images/${req.file.filename}`
    });
});

// Schema for Creating Products
const Product = mongoose.model("Product", {
    id: {
        type: Number,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    new_price: {
        type: Number,
        required: true,
    },
    old_price: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    available: {
        type: Boolean,
        default: true,
    },
});

// Creating API for adding product
app.post('/addproduct', async (req, res) => {
    let products = await Product.find({});
    let id;
    if (products.length > 0) {
        let last_product = products.slice(-1)[0];
        id = last_product.id + 1;
    } else {
        id = 1;
    }
    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image,
        category: req.body.category,
        new_price: req.body.new_price,
        old_price: req.body.old_price,
    });

    console.log(product);
    await product.save();
    console.log("Saved");
    res.json({
        success: true,
        name: req.body.name,
    });
});

// Creating API for removing product
app.post('/removeproduct', async (req, res) => {
    await Product.findOneAndDelete({ id: req.body.id });
    console.log("removed");
    res.json({
        success: true,
        name: req.body.name
    });
});

// Creating API for getting all products
app.get('/allproducts', async (req, res) => {
    let products = await Product.find({});
    console.log("All product fetched");
    res.send(products);
});

// Schema for user model
const Users = mongoose.model("Users", {
    name: {
        type: String,
    },
    email: {
        type: String,
        unique: true,
    },
    password: {
        type: String,
    },
    cartData: {
        type: Object,
    },
    date: {
        type: Date,
        default: Date.now,
    }
});

// Registration of user
app.post('/signup', async (req, res) => {
    let check = await Users.findOne({ email: req.body.email });
    if (check) {
        return res.status(400).json({
            success: false,
            errors: "Existing User With Same Email Id"
        });
    }
    let cart = {};
    for (let i = 0; i < 300; i++) {
        cart[i] = 0;
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10); // Hash the password

    const user = new Users({
        name: req.body.username,
        email: req.body.email,
        password: hashedPassword,
        cartData: cart,
    });

    await user.save();

    const data = {
        user: {
            id: user.id
        }
    };

    const token = jwt.sign(data, process.env.JWT_SECRET);
    res.json({
        success: true,
        token
    });
});

// Login of user
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    //check if user exist or not
    const user = await Users.findOne({ email });
    if (!user) {
        return res.status(400).json({
            success: false,
            errors: "Invalid Email Id Please Register"
        });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(400).json({
            success: false,
            error: "Invalid Password"
        });
    }

    const data = {
        user: {
            id: user.id
        }
    }

    const token = jwt.sign(data, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({
        success: true,
        token
    })
});

// New Collections API
app.get('/newcollections', async (req, res) => {
    try {
        let products = await Product.find({});
        let newCollection = products.slice(-8); 
        console.log("New collection fetched");
        res.send(newCollection);
    } catch (error) {
        console.error("Error fetching new collection:", error);
        res.status(500).send("Server error");
    }
});

// Creating API for popular in women 
app.get('/popularinwomen', async (req, res) => {
    let products = await Product.find({ category: "women" });
    let popular_in_women = products.slice(0, 4);
    console.log("Popular in women fetched");
    res.send(popular_in_women);
})

//Creating middleware to fetch user
const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token');

    if (!token) {
        return res.status(401).send({
            errors: "Please authenticate using valid token"
        });
    }
    try {
        const data = jwt.verify(token, process.env.JWT_SECRET);
        req.user = data.user;
        next();
    } catch (error) {
        return res.status(401).send({
            errors: "Please authenticate using a valid token"
        });
    }
}

// Creating API for add to cart
app.post('/addtocart', fetchUser, async (req, res) => {
    console.log('Added');
    let userData = await Users.findOne({ _id: req.user.id });
    userData.cartData[req.body.itemId] += 1;
    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("Added")
});

//Creating API for removing Product from cartData
app.post('/removefromCart', fetchUser, async (req, res) => {
    console.log('removed')

    let userData = await Users.findOne({ _id: req.user.id });

    if (userData.cartData[req.body.itemId] > 0)
        userData.cartData[req.body.itemId] -= 1;

    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("Removed")
});

//Endpoint to get cart Data
app.post('/getcart', fetchUser, async (req, res) => {
    console.log('GetCart');
    try {
        let userData = await Users.findOne({ _id: req.user.id });
        res.json(userData.cartData);
    } catch (error) {
        console.error('Error fetching cart data:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.listen(port, (error) => {
    if (!error) {
        console.log("Server Running on Port ");
    } else {
        console.log("Error: " + error);
    }
});
